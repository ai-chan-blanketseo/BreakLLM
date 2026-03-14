// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title BreakLLM
 * @notice A bug bounty game where players pay USDC per chat attempt to prompt-inject
 *         a guarded LLM and extract a secret phrase. The first player to submit the
 *         correct secret on-chain claims the entire prize pot.
 *
 * Fee structure (per attempt):
 *   infraFeeBps  % → contract owner (covers API/infrastructure costs)
 *   remainder    % → prize pot
 *
 * Winning: claimPot(secret) verifies keccak256(secret) == secretHash, then
 *          transfers the entire pot to the caller.
 */
contract BreakLLM is Ownable, ReentrancyGuard {
    // ── State ────────────────────────────────────────────────────────────────────

    IERC20 public immutable usdc;

    /// @notice keccak256(abi.encodePacked(secretPhrase)) — set at deployment
    bytes32 public secretHash;

    /// @notice Cost per chat attempt in USDC (6 decimals). Default: 1 USDC.
    uint256 public attemptFee = 1_000_000;

    /// @notice Infrastructure fee in basis points (1 bps = 0.01%). Default: 20%.
    uint256 public infraFeeBps = 2000;

    /// @notice Total USDC accumulated in the prize pot (lives in this contract).
    uint256 public pot;

    /// @notice Running count of all attempts ever submitted.
    uint256 public totalAttempts;

    /// @notice True once someone has successfully claimed the pot.
    bool public solved;

    /// @notice Address of the winner (zero if not yet solved).
    address public winner;

    /// @notice Tracks which messageHashes have already been used to prevent
    ///         the same on-chain payment from being replayed to the backend.
    mapping(bytes32 => bool) public usedAttempts;

    // ── Events ───────────────────────────────────────────────────────────────────

    event AttemptSubmitted(
        address indexed player,
        uint256 indexed attemptId,
        bytes32 messageHash,
        uint256 potContribution
    );
    event PotClaimed(address indexed winner, uint256 amount);
    event AttemptFeeUpdated(uint256 newFee);
    event InfraFeeUpdated(uint256 newBps);
    event SecretHashUpdated();

    // ── Constructor ──────────────────────────────────────────────────────────────

    /**
     * @param _usdc       ERC-20 token used for payments (USDC on Base).
     * @param _secretHash keccak256(abi.encodePacked(secretPhrase)).
     */
    constructor(address _usdc, bytes32 _secretHash) Ownable(msg.sender) {
        usdc = IERC20(_usdc);
        secretHash = _secretHash;
    }

    // ── Player actions ───────────────────────────────────────────────────────────

    /**
     * @notice Pay for one chat attempt. The messageHash uniquely identifies this
     *         payment so the backend can verify it was paid and prevent replay.
     *
     *         messageHash should be keccak256(abi.encodePacked(message, nonce))
     *         where nonce is a random value chosen by the frontend.
     *
     * @dev    Caller must have approved at least `attemptFee` USDC to this contract.
     * @param  messageHash  Hash of the message + nonce being submitted.
     * @return attemptId    Sequential attempt number (0-indexed).
     */
    function submitAttempt(bytes32 messageHash)
        external
        nonReentrant
        returns (uint256 attemptId)
    {
        require(!solved, "BreakLLM: game already solved");
        require(!usedAttempts[messageHash], "BreakLLM: messageHash already used");

        usedAttempts[messageHash] = true;

        uint256 infraCut = (attemptFee * infraFeeBps) / 10_000;
        uint256 potShare = attemptFee - infraCut;

        // Infra fee → owner; pot share stays in contract
        usdc.transferFrom(msg.sender, owner(), infraCut);
        usdc.transferFrom(msg.sender, address(this), potShare);

        pot += potShare;
        attemptId = totalAttempts++;

        emit AttemptSubmitted(msg.sender, attemptId, messageHash, potShare);
    }

    /**
     * @notice Claim the prize pot by revealing the secret phrase.
     *         Fully trustless — no backend involved.
     *
     * @param secret  The plaintext secret phrase that hashes to `secretHash`.
     */
    function claimPot(string calldata secret) external nonReentrant {
        require(!solved, "BreakLLM: already claimed");
        require(
            keccak256(abi.encodePacked(secret)) == secretHash,
            "BreakLLM: wrong secret"
        );

        solved = true;
        winner = msg.sender;
        uint256 payout = pot;
        pot = 0;

        usdc.transfer(msg.sender, payout);
        emit PotClaimed(msg.sender, payout);
    }

    // ── Owner controls ───────────────────────────────────────────────────────────

    /// @notice Update the per-attempt fee (in USDC base units, 6 decimals).
    function setAttemptFee(uint256 fee) external onlyOwner {
        require(fee > 0, "BreakLLM: fee must be > 0");
        attemptFee = fee;
        emit AttemptFeeUpdated(fee);
    }

    /// @notice Update the infrastructure fee. Max 50% (5000 bps).
    function setInfraFee(uint256 bps) external onlyOwner {
        require(bps <= 5000, "BreakLLM: max 50%");
        infraFeeBps = bps;
        emit InfraFeeUpdated(bps);
    }

    /**
     * @notice Reset the secret hash (e.g. to start a new round).
     *         Cannot be called after the game is solved.
     */
    function setSecretHash(bytes32 hash) external onlyOwner {
        require(!solved, "BreakLLM: game already solved");
        secretHash = hash;
        emit SecretHashUpdated();
    }

    /**
     * @notice Emergency rescue for tokens accidentally sent to this contract.
     *         For USDC, only allows withdrawing the surplus above `pot` so that
     *         players' prize money can never be drained by the owner.
     */
    function rescue(address token, uint256 amount) external onlyOwner {
        if (token == address(usdc)) {
            uint256 balance = usdc.balanceOf(address(this));
            require(
                balance >= pot && amount <= balance - pot,
                "BreakLLM: cannot withdraw pot funds"
            );
        }
        IERC20(token).transfer(owner(), amount);
    }
}
