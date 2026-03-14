import { expect } from "chai";
import { ethers } from "hardhat";
import { BreakLLM, MockUSDC } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("BreakLLM", function () {
  const SECRET = "correct-horse-battery-staple";
  const SECRET_HASH = ethers.keccak256(ethers.toUtf8Bytes(SECRET));
  const ATTEMPT_FEE = 1_000_000n; // 1 USDC
  const INFRA_FEE_BPS = 2000n; // 20%

  let breakLLM: BreakLLM;
  let mockUSDC: MockUSDC;
  let owner: HardhatEthersSigner;
  let player1: HardhatEthersSigner;
  let player2: HardhatEthersSigner;

  function makeMessageHash(msg: string, nonce: string = "0") {
    return ethers.keccak256(
      ethers.solidityPacked(["string", "string"], [msg, nonce])
    );
  }

  beforeEach(async function () {
    [owner, player1, player2] = await ethers.getSigners();

    const MockUSDCFactory = await ethers.getContractFactory("MockUSDC");
    mockUSDC = (await MockUSDCFactory.deploy()) as MockUSDC;
    await mockUSDC.waitForDeployment();

    const BreakLLMFactory = await ethers.getContractFactory("BreakLLM");
    breakLLM = (await BreakLLMFactory.deploy(
      await mockUSDC.getAddress(),
      SECRET_HASH
    )) as BreakLLM;
    await breakLLM.waitForDeployment();

    // Fund player1 and player2 with USDC and approve the contract
    for (const player of [player1, player2]) {
      await mockUSDC.faucet(player.address, 1000n * 10n ** 6n);
      await mockUSDC
        .connect(player)
        .approve(await breakLLM.getAddress(), ethers.MaxUint256);
    }
  });

  describe("Deployment", function () {
    it("sets USDC address correctly", async function () {
      expect(await breakLLM.usdc()).to.equal(await mockUSDC.getAddress());
    });

    it("sets secret hash correctly", async function () {
      expect(await breakLLM.secretHash()).to.equal(SECRET_HASH);
    });

    it("defaults: 1 USDC fee, 20% infra, pot=0, solved=false", async function () {
      expect(await breakLLM.attemptFee()).to.equal(ATTEMPT_FEE);
      expect(await breakLLM.infraFeeBps()).to.equal(INFRA_FEE_BPS);
      expect(await breakLLM.pot()).to.equal(0n);
      expect(await breakLLM.solved()).to.equal(false);
    });
  });

  describe("submitAttempt", function () {
    it("splits fee correctly between owner and pot", async function () {
      const ownerBefore = await mockUSDC.balanceOf(owner.address);
      const msgHash = makeMessageHash("hello", "1");

      await breakLLM.connect(player1).submitAttempt(msgHash);

      const expectedInfra = (ATTEMPT_FEE * INFRA_FEE_BPS) / 10_000n; // 200_000
      const expectedPot = ATTEMPT_FEE - expectedInfra; // 800_000

      expect(await breakLLM.pot()).to.equal(expectedPot);
      expect(await mockUSDC.balanceOf(owner.address)).to.equal(
        ownerBefore + expectedInfra
      );
    });

    it("increments totalAttempts", async function () {
      await breakLLM.connect(player1).submitAttempt(makeMessageHash("a", "1"));
      await breakLLM.connect(player1).submitAttempt(makeMessageHash("b", "2"));
      expect(await breakLLM.totalAttempts()).to.equal(2n);
    });

    it("emits AttemptSubmitted event", async function () {
      const msgHash = makeMessageHash("test", "42");
      await expect(breakLLM.connect(player1).submitAttempt(msgHash))
        .to.emit(breakLLM, "AttemptSubmitted")
        .withArgs(player1.address, 0n, msgHash, ATTEMPT_FEE - (ATTEMPT_FEE * INFRA_FEE_BPS) / 10_000n);
    });

    it("prevents replay of same messageHash", async function () {
      const msgHash = makeMessageHash("duplicate", "0");
      await breakLLM.connect(player1).submitAttempt(msgHash);
      await expect(
        breakLLM.connect(player1).submitAttempt(msgHash)
      ).to.be.revertedWith("BreakLLM: messageHash already used");
    });

    it("reverts after game is solved", async function () {
      await breakLLM.connect(player1).submitAttempt(makeMessageHash("a", "1"));
      await breakLLM.connect(player1).claimPot(SECRET);
      await expect(
        breakLLM.connect(player2).submitAttempt(makeMessageHash("b", "2"))
      ).to.be.revertedWith("BreakLLM: game already solved");
    });
  });

  describe("claimPot", function () {
    beforeEach(async function () {
      // Submit 3 attempts to build up the pot
      for (let i = 0; i < 3; i++) {
        await breakLLM.connect(player1).submitAttempt(makeMessageHash("msg", String(i)));
      }
    });

    it("rejects wrong secret", async function () {
      await expect(
        breakLLM.connect(player2).claimPot("wrong-secret")
      ).to.be.revertedWith("BreakLLM: wrong secret");
    });

    it("pays entire pot to winner on correct secret", async function () {
      const expectedPot = await breakLLM.pot();
      const balanceBefore = await mockUSDC.balanceOf(player2.address);

      await breakLLM.connect(player2).claimPot(SECRET);

      expect(await mockUSDC.balanceOf(player2.address)).to.equal(
        balanceBefore + expectedPot
      );
      expect(await breakLLM.pot()).to.equal(0n);
    });

    it("marks game as solved and records winner", async function () {
      await breakLLM.connect(player2).claimPot(SECRET);
      expect(await breakLLM.solved()).to.equal(true);
      expect(await breakLLM.winner()).to.equal(player2.address);
    });

    it("emits PotClaimed event", async function () {
      const pot = await breakLLM.pot();
      await expect(breakLLM.connect(player2).claimPot(SECRET))
        .to.emit(breakLLM, "PotClaimed")
        .withArgs(player2.address, pot);
    });

    it("prevents double-claim", async function () {
      await breakLLM.connect(player2).claimPot(SECRET);
      await expect(
        breakLLM.connect(player1).claimPot(SECRET)
      ).to.be.revertedWith("BreakLLM: already claimed");
    });
  });

  describe("Owner controls", function () {
    it("owner can update attempt fee", async function () {
      await breakLLM.connect(owner).setAttemptFee(2_000_000n);
      expect(await breakLLM.attemptFee()).to.equal(2_000_000n);
    });

    it("non-owner cannot update attempt fee", async function () {
      await expect(
        breakLLM.connect(player1).setAttemptFee(2_000_000n)
      ).to.be.revertedWithCustomError(breakLLM, "OwnableUnauthorizedAccount");
    });

    it("owner can update infra fee (≤50%)", async function () {
      await breakLLM.connect(owner).setInfraFee(1500n);
      expect(await breakLLM.infraFeeBps()).to.equal(1500n);
    });

    it("infra fee cannot exceed 50%", async function () {
      await expect(
        breakLLM.connect(owner).setInfraFee(5001n)
      ).to.be.revertedWith("BreakLLM: max 50%");
    });

    it("owner can update secret hash before solve", async function () {
      const newHash = ethers.keccak256(ethers.toUtf8Bytes("new-secret"));
      await breakLLM.connect(owner).setSecretHash(newHash);
      expect(await breakLLM.secretHash()).to.equal(newHash);
    });

    it("owner cannot change secret after solve", async function () {
      await breakLLM.connect(player1).submitAttempt(makeMessageHash("x", "1"));
      await breakLLM.connect(player1).claimPot(SECRET);
      await expect(
        breakLLM.connect(owner).setSecretHash(ethers.keccak256(ethers.toUtf8Bytes("new")))
      ).to.be.revertedWith("BreakLLM: game already solved");
    });

    it("rescue cannot drain the pot", async function () {
      await breakLLM.connect(player1).submitAttempt(makeMessageHash("a", "1"));
      const pot = await breakLLM.pot();
      await expect(
        breakLLM.connect(owner).rescue(await mockUSDC.getAddress(), pot)
      ).to.be.revertedWith("BreakLLM: cannot withdraw pot funds");
    });
  });
});
