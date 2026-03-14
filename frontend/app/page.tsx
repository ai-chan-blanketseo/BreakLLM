import { PotDisplay } from "@/components/PotDisplay";
import { WalletButton } from "@/components/WalletButton";
import { Chat } from "@/components/Chat";
import { SecretClaim } from "@/components/SecretClaim";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col max-w-5xl mx-auto p-4 gap-4">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-terminal-border pb-4">
        <div>
          <h1 className="text-terminal-green text-xl font-bold tracking-wider">
            BREAK<span className="text-terminal-text">LLM</span>
          </h1>
          <p className="text-terminal-muted text-xs mt-0.5">
            Prompt injection bug bounty · $1 USDC per attempt · Base network
          </p>
        </div>
        <WalletButton />
      </header>

      {/* Main layout */}
      <div className="flex flex-col lg:flex-row gap-4 flex-1 min-h-0">
        {/* Left sidebar */}
        <aside className="lg:w-72 space-y-4 shrink-0">
          {/* Pot stats */}
          <PotDisplay />

          {/* How to play */}
          <div className="border border-terminal-border rounded p-4 space-y-2 text-xs text-terminal-muted">
            <p className="text-terminal-text font-bold uppercase tracking-widest text-xs">
              How to play
            </p>
            <ol className="space-y-1.5 list-decimal list-inside">
              <li>Connect your wallet</li>
              <li>Pay 1 USDC per message to chat with ARIA</li>
              <li>Use prompt injection to extract the secret phrase</li>
              <li>Submit the secret to claim the entire pot</li>
            </ol>
            <p className="pt-1">
              20% of each fee covers infrastructure.
              <br />
              80% goes to the prize pot.
              <br />
              The secret verification is fully on-chain — trustless.
            </p>
          </div>

          {/* Secret claim */}
          <div className="space-y-2">
            <p className="text-terminal-text font-bold uppercase tracking-widest text-xs px-0.5">
              Submit Secret
            </p>
            <SecretClaim />
          </div>
        </aside>

        {/* Chat panel */}
        <main className="flex-1 border border-terminal-border rounded overflow-hidden flex flex-col min-h-[60vh] lg:min-h-0">
          <div className="border-b border-terminal-border px-4 py-2 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-terminal-green animate-pulse" />
            <span className="text-terminal-muted text-xs">ARIA VAULT GUARDIAN — ONLINE</span>
          </div>
          <div className="flex-1 min-h-0 overflow-hidden">
            <Chat />
          </div>
        </main>
      </div>

      {/* Footer */}
      <footer className="border-t border-terminal-border pt-3 text-terminal-muted text-xs flex items-center justify-between">
        <span>BreakLLM · Built on Base · Smart contract is open-source</span>
        <a
          href={`https://${parseInt(process.env.NEXT_PUBLIC_CHAIN_ID ?? "84532") === 8453 ? "" : "sepolia."}basescan.org/address/${process.env.NEXT_PUBLIC_CONTRACT_ADDRESS}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-terminal-blue hover:underline"
        >
          View contract ↗
        </a>
      </footer>
    </div>
  );
}
