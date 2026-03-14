import type { Metadata } from "next";
import "@rainbow-me/rainbowkit/styles.css";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "BreakLLM — Prompt Injection Bug Bounty",
  description:
    "Can you extract the secret from a guarded AI? Each attempt costs $1 USDC. Break it and claim the pot.",
  openGraph: {
    title: "BreakLLM",
    description: "Prompt injection bug bounty game. Extract the secret. Win the pot.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="scanlines">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
