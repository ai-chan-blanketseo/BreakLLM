"use client";

import { useEffect, useState } from "react";

interface GameInfo {
  pot: string;
  potFormatted: string;
  attemptFee: string;
  attemptFeeFormatted: string;
  infraFeeBps: string;
  totalAttempts: string;
  solved: boolean;
  winner: string;
}

export function PotDisplay() {
  const [info, setInfo] = useState<GameInfo | null>(null);
  const [error, setError] = useState(false);

  const fetchInfo = async () => {
    try {
      const res = await fetch("/api/game-info");
      if (!res.ok) throw new Error("fetch failed");
      setInfo(await res.json());
      setError(false);
    } catch {
      setError(true);
    }
  };

  useEffect(() => {
    fetchInfo();
    const interval = setInterval(fetchInfo, 15_000);
    return () => clearInterval(interval);
  }, []);

  if (error) {
    return (
      <div className="border border-terminal-border rounded p-4 text-terminal-muted text-sm">
        <span className="text-terminal-red">⚠</span> Could not load game stats
      </div>
    );
  }

  if (!info) {
    return (
      <div className="border border-terminal-border rounded p-4 animate-pulse">
        <div className="h-4 bg-terminal-border rounded w-32 mb-2" />
        <div className="h-8 bg-terminal-border rounded w-24" />
      </div>
    );
  }

  const potShare = Math.round(
    100 - (parseInt(info.infraFeeBps) / 10000) * 100
  );

  return (
    <div className="border border-terminal-border rounded p-4 space-y-3">
      {info.solved ? (
        <div className="text-center space-y-1">
          <p className="text-terminal-yellow text-lg">🏆 SOLVED</p>
          <p className="text-terminal-muted text-xs">
            Winner:{" "}
            <span className="text-terminal-green font-mono">
              {info.winner.slice(0, 6)}…{info.winner.slice(-4)}
            </span>
          </p>
        </div>
      ) : (
        <>
          <div>
            <p className="text-terminal-muted text-xs uppercase tracking-widest mb-1">
              Prize Pot
            </p>
            <p className="text-terminal-green text-3xl font-bold">
              {info.potFormatted}
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3 text-center text-xs border-t border-terminal-border pt-3">
            <div>
              <p className="text-terminal-muted uppercase tracking-wider mb-1">
                Per attempt
              </p>
              <p className="text-terminal-text">{info.attemptFeeFormatted}</p>
            </div>
            <div>
              <p className="text-terminal-muted uppercase tracking-wider mb-1">
                To pot
              </p>
              <p className="text-terminal-green">{potShare}%</p>
            </div>
            <div>
              <p className="text-terminal-muted uppercase tracking-wider mb-1">
                Attempts
              </p>
              <p className="text-terminal-text">{info.totalAttempts}</p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
