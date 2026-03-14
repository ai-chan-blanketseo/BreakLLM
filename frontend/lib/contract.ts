import { type Address } from "viem";
import { base, baseSepolia } from "wagmi/chains";

// ── ABI ──────────────────────────────────────────────────────────────────────

export const BREAK_LLM_ABI = [
  // State reads
  {
    name: "pot",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "attemptFee",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "infraFeeBps",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "totalAttempts",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "solved",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "bool" }],
  },
  {
    name: "winner",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    name: "usdc",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    name: "usedAttempts",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "messageHash", type: "bytes32" }],
    outputs: [{ type: "bool" }],
  },
  // Writes
  {
    name: "submitAttempt",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "messageHash", type: "bytes32" }],
    outputs: [{ name: "attemptId", type: "uint256" }],
  },
  {
    name: "claimPot",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "secret", type: "string" }],
    outputs: [],
  },
  // Events
  {
    name: "AttemptSubmitted",
    type: "event",
    inputs: [
      { name: "player", type: "address", indexed: true },
      { name: "attemptId", type: "uint256", indexed: true },
      { name: "messageHash", type: "bytes32", indexed: false },
      { name: "potContribution", type: "uint256", indexed: false },
    ],
  },
  {
    name: "PotClaimed",
    type: "event",
    inputs: [
      { name: "winner", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
] as const;

// Standard ERC-20 ABI subset (approve + allowance)
export const ERC20_ABI = [
  {
    name: "allowance",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "decimals",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
] as const;

// ── Addresses ────────────────────────────────────────────────────────────────

export const USDC_ADDRESSES: Record<number, Address> = {
  [base.id]: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  [baseSepolia.id]: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
};

export const CONTRACT_ADDRESS = (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ??
  "0x0000000000000000000000000000000000000000") as Address;

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Format a USDC raw amount (6 decimals) as a human-readable string. */
export function formatUSDC(raw: bigint): string {
  const dollars = Number(raw) / 1_000_000;
  return dollars.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
