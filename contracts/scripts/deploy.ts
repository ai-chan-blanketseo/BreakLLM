import { ethers, network } from "hardhat";
import * as dotenv from "dotenv";

dotenv.config();

// USDC contract addresses by chain ID
const USDC_ADDRESSES: Record<number, string> = {
  8453: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // Base mainnet
  84532: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", // Base Sepolia
  31337: "", // Hardhat local — deploy mock USDC
};

async function main() {
  const [deployer] = await ethers.getSigners();
  const chainId = (await ethers.provider.getNetwork()).chainId;

  console.log(`\nDeploying BreakLLM to network: ${network.name} (chainId: ${chainId})`);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Balance:  ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} ETH\n`);

  const secret = process.env.SECRET;
  if (!secret) {
    throw new Error("SECRET env var is required — set it in contracts/.env");
  }

  const secretHash = ethers.keccak256(ethers.toUtf8Bytes(secret));
  console.log(`Secret hash: ${secretHash}`);
  console.log("(Store this — needed to verify the hash on-chain is correct)\n");

  let usdcAddress = USDC_ADDRESSES[Number(chainId)];

  // On localhost, deploy a minimal mock ERC-20 for testing
  if (Number(chainId) === 31337) {
    console.log("Local network detected — deploying MockUSDC...");
    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    const mockUsdc = await MockUSDC.deploy();
    await mockUsdc.waitForDeployment();
    usdcAddress = await mockUsdc.getAddress();
    console.log(`MockUSDC deployed to: ${usdcAddress}\n`);
  }

  if (!usdcAddress) {
    throw new Error(`No USDC address configured for chainId ${chainId}`);
  }

  const BreakLLM = await ethers.getContractFactory("BreakLLM");
  const breakLLM = await BreakLLM.deploy(usdcAddress, secretHash);
  await breakLLM.waitForDeployment();

  const contractAddress = await breakLLM.getAddress();
  console.log(`BreakLLM deployed to: ${contractAddress}`);
  console.log("\n── Add these to your frontend/.env.local ──────────────────────────");
  console.log(`CONTRACT_ADDRESS=${contractAddress}`);
  console.log(`NEXT_PUBLIC_CONTRACT_ADDRESS=${contractAddress}`);
  console.log(`NEXT_PUBLIC_CHAIN_ID=${chainId}`);
  console.log("───────────────────────────────────────────────────────────────────\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
