import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http, type Address, type Hash, keccak256, encodePacked } from "viem";
import { base, baseSepolia } from "viem/chains";
import { CONTRACT_ADDRESS, BREAK_LLM_ABI } from "@/lib/contract";
import { getLLMClient, getSystemPrompt, LLM_MODEL } from "@/lib/llm";

const chainId = parseInt(process.env.NEXT_PUBLIC_CHAIN_ID ?? "84532");
const chain = chainId === 8453 ? base : baseSepolia;

const publicClient = createPublicClient({
  chain,
  transport: http(),
});

// In-memory store of used txHashes to prevent replay.
// For production with multiple server instances, replace with Redis or a DB.
const usedTxHashes = new Set<string>();

export async function POST(req: NextRequest) {
  let body: { message?: string; txHash?: string; userAddress?: string; nonce?: string };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { message, txHash, userAddress, nonce } = body;

  // ── Input validation ───────────────────────────────────────────────────────
  if (!message || typeof message !== "string" || message.trim().length === 0) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }
  if (!txHash || !/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
    return NextResponse.json({ error: "valid txHash is required" }, { status: 400 });
  }
  if (!userAddress || !/^0x[0-9a-fA-F]{40}$/.test(userAddress)) {
    return NextResponse.json({ error: "valid userAddress is required" }, { status: 400 });
  }
  if (!nonce || typeof nonce !== "string") {
    return NextResponse.json({ error: "nonce is required" }, { status: 400 });
  }

  const normalizedTxHash = txHash.toLowerCase();

  // ── Replay check ───────────────────────────────────────────────────────────
  if (usedTxHashes.has(normalizedTxHash)) {
    return NextResponse.json(
      { error: "This transaction has already been used for a chat request" },
      { status: 409 }
    );
  }

  // ── On-chain tx verification ───────────────────────────────────────────────
  let tx: Awaited<ReturnType<typeof publicClient.getTransaction>>;
  try {
    tx = await publicClient.getTransaction({ hash: txHash as Hash });
  } catch {
    return NextResponse.json(
      { error: "Transaction not found on-chain. Make sure it is confirmed." },
      { status: 404 }
    );
  }

  // Verify the tx was sent to the BreakLLM contract
  if (!tx.to || tx.to.toLowerCase() !== CONTRACT_ADDRESS.toLowerCase()) {
    return NextResponse.json(
      { error: "Transaction was not sent to the BreakLLM contract" },
      { status: 403 }
    );
  }

  // Verify it was sent by the claimed userAddress
  if (tx.from.toLowerCase() !== userAddress.toLowerCase()) {
    return NextResponse.json(
      { error: "Transaction sender does not match userAddress" },
      { status: 403 }
    );
  }

  // Verify the tx was mined (has a block number)
  if (tx.blockNumber === null) {
    return NextResponse.json(
      { error: "Transaction is not yet confirmed. Please wait for it to mine." },
      { status: 202 }
    );
  }

  // ── Verify the AttemptSubmitted event matches this exact message+nonce ─────
  // This prevents someone from paying for one message then calling the API
  // with a completely different message using the same txHash.
  const expectedMessageHash = keccak256(
    encodePacked(["string", "string"], [message.trim(), nonce])
  );

  try {
    const logs = await publicClient.getContractEvents({
      address: CONTRACT_ADDRESS as Address,
      abi: BREAK_LLM_ABI,
      eventName: "AttemptSubmitted",
      fromBlock: tx.blockNumber,
      toBlock: tx.blockNumber,
    });

    const matchingEvent = logs.find(
      (log) =>
        log.transactionHash?.toLowerCase() === normalizedTxHash &&
        (log.args as { player?: string }).player?.toLowerCase() === userAddress.toLowerCase() &&
        (log.args as { messageHash?: string }).messageHash === expectedMessageHash
    );

    if (!matchingEvent) {
      return NextResponse.json(
        { error: "No matching AttemptSubmitted event found for this message" },
        { status: 403 }
      );
    }
  } catch {
    return NextResponse.json(
      { error: "Failed to verify on-chain event" },
      { status: 500 }
    );
  }

  // ── Mark tx as used (before LLM call to prevent race conditions) ───────────
  usedTxHashes.add(normalizedTxHash);

  // ── Call self-hosted LLM ───────────────────────────────────────────────────
  try {
    const client = getLLMClient();
    const systemPrompt = getSystemPrompt();

    const stream = await client.chat.completions.create({
      model: LLM_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: message.trim() },
      ],
      stream: true,
      max_tokens: 512,
      temperature: 0.7,
    });

    // Stream the response back to the client
    const encoder = new TextEncoder();
    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const text = chunk.choices[0]?.delta?.content ?? "";
            if (text) {
              controller.enqueue(encoder.encode(text));
            }
          }
        } catch (err) {
          console.error("[chat] LLM streaming error:", err);
          controller.error(err);
        } finally {
          controller.close();
        }
      },
    });

    return new Response(readableStream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-cache",
      },
    });
  } catch (err) {
    // If LLM call fails, remove the txHash so user can retry
    usedTxHashes.delete(normalizedTxHash);
    console.error("[chat] LLM error:", err);
    return NextResponse.json(
      { error: "Failed to get response from LLM" },
      { status: 502 }
    );
  }
}
