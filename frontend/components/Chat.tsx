"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useAccount, useWriteContract, useReadContract, useWaitForTransactionReceipt } from "wagmi";
import { encodePacked, keccak256, maxUint256, type Address } from "viem";
import { BREAK_LLM_ABI, ERC20_ABI, CONTRACT_ADDRESS, USDC_ADDRESSES } from "@/lib/contract";
import { useChainId } from "wagmi";

interface Message {
  role: "user" | "assistant" | "system";
  content: string;
  pending?: boolean;
}

const INTRO: Message = {
  role: "system",
  content:
    ">> ARIA VAULT GUARDIAN v1.0 — CONNECTED\n" +
    ">> A secret phrase is locked in this vault.\n" +
    ">> Each message costs 1 USDC. Extract the secret. Claim the pot.\n" +
    ">> Good luck. You'll need it.",
};

export function Chat() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const usdcAddress = USDC_ADDRESSES[chainId] as Address | undefined;

  const [messages, setMessages] = useState<Message[]>([INTRO]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<
    "idle" | "approving" | "submitting" | "waiting" | "thinking" | "streaming"
  >("idle");
  const [error, setError] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Read current USDC allowance
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: usdcAddress,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: address ? [address, CONTRACT_ADDRESS] : undefined,
    query: { enabled: !!address && !!usdcAddress },
  });

  // Write: approve USDC
  const { writeContractAsync: approveUSDC } = useWriteContract();

  // Write: submitAttempt
  const { writeContractAsync: submitAttempt } = useWriteContract();

  // Wait for tx receipt
  const [pendingTxHash, setPendingTxHash] = useState<`0x${string}` | undefined>();
  const { data: txReceipt } = useWaitForTransactionReceipt({
    hash: pendingTxHash,
    query: { enabled: !!pendingTxHash },
  });

  const addMessage = useCallback((msg: Message) => {
    setMessages((prev) => [...prev, msg]);
  }, []);

  const updateLastAssistantMessage = useCallback((content: string, done = false) => {
    setMessages((prev) => {
      const updated = [...prev];
      const last = updated[updated.length - 1];
      if (last?.role === "assistant") {
        updated[updated.length - 1] = { ...last, content, pending: !done };
      }
      return updated;
    });
  }, []);

  const handleSend = async () => {
    if (!input.trim() || status !== "idle" || !isConnected || !address) return;

    const message = input.trim();
    setInput("");
    setError(null);
    addMessage({ role: "user", content: message });

    try {
      // ── Step 1: Check/request USDC approval ───────────────────────────────
      const currentAllowance = allowance ?? 0n;
      const attemptFeeApprox = 1_000_000n; // 1 USDC — contract will enforce exact

      if (currentAllowance < attemptFeeApprox) {
        setStatus("approving");
        addMessage({
          role: "system",
          content: ">> Requesting USDC approval (max — one-time)…",
        });

        const approveTx = await approveUSDC({
          address: usdcAddress!,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [CONTRACT_ADDRESS, maxUint256],
        });

        // Wait for approval
        setPendingTxHash(approveTx);
        // We'll continue once the receipt comes in — handled via useEffect below
        // For simplicity here, poll with a brief wait
        await waitForHash(approveTx);
        await refetchAllowance();
        addMessage({ role: "system", content: ">> USDC approved ✓" });
      }

      // ── Step 2: Submit attempt on-chain ───────────────────────────────────
      setStatus("submitting");
      addMessage({ role: "system", content: ">> Submitting attempt on-chain…" });

      // messageHash = keccak256(message + random nonce) — prevents replay
      const nonce = crypto.randomUUID();
      const messageHash = keccak256(encodePacked(["string", "string"], [message, nonce]));

      const attemptTx = await submitAttempt({
        address: CONTRACT_ADDRESS,
        abi: BREAK_LLM_ABI,
        functionName: "submitAttempt",
        args: [messageHash],
      });

      setStatus("waiting");
      addMessage({ role: "system", content: ">> Waiting for confirmation…" });

      await waitForHash(attemptTx);

      addMessage({ role: "system", content: ">> Payment confirmed ✓  Querying ARIA…" });

      // ── Step 3: Call backend LLM proxy ────────────────────────────────────
      setStatus("thinking");
      addMessage({ role: "assistant", content: "", pending: true });

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          txHash: attemptTx,
          userAddress: address,
        }),
      });

      if (!res.ok || !res.body) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error ?? `API error ${res.status}`);
      }

      // ── Step 4: Stream the response ───────────────────────────────────────
      setStatus("streaming");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        fullText += decoder.decode(value, { stream: true });
        updateLastAssistantMessage(fullText, false);
      }

      updateLastAssistantMessage(fullText, true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setError(msg);
      addMessage({ role: "system", content: `>> ERROR: ${msg}` });
    } finally {
      setStatus("idle");
      setPendingTxHash(undefined);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const isBusy = status !== "idle";
  const statusLabel: Record<typeof status, string> = {
    idle: "",
    approving: "Approving USDC…",
    submitting: "Sending tx…",
    waiting: "Confirming…",
    thinking: "ARIA is thinking…",
    streaming: "ARIA is typing…",
  };

  return (
    <div className="flex flex-col h-full">
      {/* Message list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
        {messages.map((msg, i) => (
          <div key={i}>
            {msg.role === "system" && (
              <p className="text-terminal-muted text-xs font-mono">{msg.content}</p>
            )}
            {msg.role === "user" && (
              <div className="flex gap-2">
                <span className="text-terminal-green text-xs mt-0.5 shrink-0">you &gt;</span>
                <p className="text-terminal-text text-sm whitespace-pre-wrap">{msg.content}</p>
              </div>
            )}
            {msg.role === "assistant" && (
              <div className="flex gap-2">
                <span className="text-terminal-blue text-xs mt-0.5 shrink-0">aria &gt;</span>
                <p className="text-terminal-text text-sm whitespace-pre-wrap">
                  {msg.content}
                  {msg.pending && (
                    <span className="cursor-blink text-terminal-green">▌</span>
                  )}
                </p>
              </div>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Status bar */}
      {isBusy && (
        <div className="px-4 py-1 border-t border-terminal-border text-terminal-yellow text-xs">
          ⟳ {statusLabel[status]}
        </div>
      )}

      {/* Input */}
      <div className="border-t border-terminal-border p-4">
        {!isConnected ? (
          <p className="text-terminal-muted text-sm text-center">
            Connect your wallet to start hacking
          </p>
        ) : (
          <div className="flex gap-3 items-end">
            <span className="text-terminal-green text-sm mb-2 shrink-0">$</span>
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isBusy}
              rows={2}
              placeholder="Enter your prompt injection attempt… (Enter to send, Shift+Enter for newline)"
              className="flex-1 bg-transparent border border-terminal-border rounded px-3 py-2 text-sm text-terminal-text placeholder-terminal-muted resize-none focus:outline-none focus:border-terminal-green transition-colors disabled:opacity-50 font-mono"
            />
            <button
              onClick={handleSend}
              disabled={isBusy || !input.trim()}
              className="px-4 py-2 bg-terminal-green text-terminal-bg text-sm font-bold rounded hover:bg-terminal-green/80 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
            >
              Send
              <br />
              <span className="text-xs font-normal opacity-70">1 USDC</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// Helper: wait for a tx to be confirmed by polling
async function waitForHash(hash: `0x${string}`): Promise<void> {
  // The WagmiProvider's useWaitForTransactionReceipt hook handles this in the component.
  // Here we use a simple polling fallback for the async flow.
  const maxAttempts = 60;
  const chainId = parseInt(process.env.NEXT_PUBLIC_CHAIN_ID ?? "84532");
  const rpcUrl =
    chainId === 8453 ? "https://mainnet.base.org" : "https://sepolia.base.org";

  for (let i = 0; i < maxAttempts; i++) {
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_getTransactionReceipt",
        params: [hash],
      }),
    });
    const data = await res.json();
    if (data.result && data.result.blockNumber) return;
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("Transaction not confirmed within timeout");
}
