import { NextResponse } from "next/server";
import { createPublicClient, http, type Address } from "viem";
import { base, baseSepolia } from "viem/chains";
import { BREAK_LLM_ABI, CONTRACT_ADDRESS, formatUSDC } from "@/lib/contract";

const chainId = parseInt(process.env.NEXT_PUBLIC_CHAIN_ID ?? "84532");
const chain = chainId === 8453 ? base : baseSepolia;

const publicClient = createPublicClient({
  chain,
  transport: http(),
});

export const revalidate = 0; // Always fetch fresh

export async function GET() {
  try {
    const address = CONTRACT_ADDRESS as Address;

    const [pot, attemptFee, infraFeeBps, totalAttempts, solved, winner] =
      await Promise.all([
        publicClient.readContract({ address, abi: BREAK_LLM_ABI, functionName: "pot" }),
        publicClient.readContract({ address, abi: BREAK_LLM_ABI, functionName: "attemptFee" }),
        publicClient.readContract({ address, abi: BREAK_LLM_ABI, functionName: "infraFeeBps" }),
        publicClient.readContract({ address, abi: BREAK_LLM_ABI, functionName: "totalAttempts" }),
        publicClient.readContract({ address, abi: BREAK_LLM_ABI, functionName: "solved" }),
        publicClient.readContract({ address, abi: BREAK_LLM_ABI, functionName: "winner" }),
      ]);

    return NextResponse.json({
      pot: pot.toString(),
      potFormatted: formatUSDC(pot),
      attemptFee: attemptFee.toString(),
      attemptFeeFormatted: formatUSDC(attemptFee),
      infraFeeBps: infraFeeBps.toString(),
      totalAttempts: totalAttempts.toString(),
      solved,
      winner,
    });
  } catch (err) {
    console.error("[game-info] Error reading contract:", err);
    return NextResponse.json(
      { error: "Failed to read contract state" },
      { status: 500 }
    );
  }
}
