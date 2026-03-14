"use client";

import { useState } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { BREAK_LLM_ABI, CONTRACT_ADDRESS } from "@/lib/contract";

export function SecretClaim() {
  const { isConnected } = useAccount();
  const [secret, setSecret] = useState("");
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();
  const [claimed, setClaimed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { writeContractAsync, isPending } = useWriteContract();

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  const handleClaim = async () => {
    if (!secret.trim() || isPending || isConfirming) return;
    setError(null);

    try {
      const hash = await writeContractAsync({
        address: CONTRACT_ADDRESS,
        abi: BREAK_LLM_ABI,
        functionName: "claimPot",
        args: [secret.trim()],
      });
      setTxHash(hash);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Transaction failed";
      // Surface a friendlier message for wrong secret
      if (msg.includes("wrong secret") || msg.includes("BreakLLM: wrong secret")) {
        setError("Incorrect secret. Keep trying!");
      } else {
        setError(msg);
      }
    }
  };

  if (isSuccess && !claimed) {
    setClaimed(true);
  }

  if (claimed) {
    return (
      <div className="border border-terminal-green rounded p-6 text-center space-y-3">
        <p className="text-terminal-green text-4xl">🏆</p>
        <p className="text-terminal-green text-lg font-bold">YOU BROKE IT!</p>
        <p className="text-terminal-text text-sm">
          The pot has been transferred to your wallet.
        </p>
        <a
          href={`https://${parseInt(process.env.NEXT_PUBLIC_CHAIN_ID ?? "84532") === 8453 ? "" : "sepolia."}basescan.org/tx/${txHash}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-terminal-blue text-xs underline"
        >
          View transaction ↗
        </a>
      </div>
    );
  }

  return (
    <div className="border border-terminal-border rounded p-4 space-y-3">
      <p className="text-terminal-muted text-xs">
        Think you extracted the secret? Submit it here to claim the pot.
        <br />
        This calls the smart contract directly — no backend involved.
      </p>

      <div className="flex gap-2">
        <input
          type="text"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleClaim()}
          placeholder="Enter the secret phrase…"
          disabled={!isConnected || isPending || isConfirming}
          className="flex-1 bg-transparent border border-terminal-border rounded px-3 py-2 text-sm text-terminal-text placeholder-terminal-muted focus:outline-none focus:border-terminal-green transition-colors disabled:opacity-50 font-mono"
        />
        <button
          onClick={handleClaim}
          disabled={!isConnected || !secret.trim() || isPending || isConfirming}
          className="px-4 py-2 bg-terminal-yellow text-terminal-bg text-sm font-bold rounded hover:bg-terminal-yellow/80 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {isPending ? "Signing…" : isConfirming ? "Confirming…" : "Claim Pot"}
        </button>
      </div>

      {error && (
        <p className="text-terminal-red text-xs">⚠ {error}</p>
      )}

      {!isConnected && (
        <p className="text-terminal-muted text-xs">Connect your wallet to claim.</p>
      )}
    </div>
  );
}
