"use client";

import React, { useState, useEffect } from "react";
import { Award, ShieldAlert, Trophy, ShieldCheck } from "lucide-react";

interface Leader {
  wallet: string;
  username: string | null;
  reputation: number;
  tradeCount: number;
  totalVolume: number;
}

export default function LeaderboardPage() {
  const [leaders, setLeaders] = useState<Leader[]>([]);
  const [loading, setLoading] = useState(true);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

  useEffect(() => {
    async function fetchLeaders() {
      try {
        const res = await fetch(`${API_URL}/leaderboard`);
        if (res.ok) {
          setLeaders(await res.json());
        }
      } catch (err) {
        console.error("Error fetching leaderboard:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchLeaders();
  }, [API_URL]);

  if (loading) {
    return (
      <div className="flex justify-center py-40">
        <svg className="h-10 w-10 animate-spin text-primary" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <div className="text-center space-y-2">
        <div className="inline-flex rounded-full bg-yellow-500/10 p-2.5 text-yellow-500">
          <Trophy className="h-6 w-6" />
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight text-white">Global Leaderboard</h1>
        <p className="text-slate-400 text-sm max-w-md mx-auto">
          Rankings of the top information traders on PredictX by volume, trade count, and platform reputation.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-border/60 bg-slate-900/40 text-slate-500 uppercase tracking-wider font-semibold">
                <th className="px-6 py-4 w-20">Rank</th>
                <th className="px-4 py-4">User</th>
                <th className="px-4 py-4 text-center">Trades</th>
                <th className="px-4 py-4 text-center">Reputation</th>
                <th className="px-6 py-4 text-right">Volume</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {leaders.map((leader, index) => {
                const isTop3 = index < 3;
                const badges = ["text-yellow-500", "text-slate-300", "text-amber-600"];
                
                return (
                  <tr key={leader.wallet} className="hover:bg-slate-900/10 transition-colors">
                    <td className="px-6 py-4 font-bold">
                      {isTop3 ? (
                        <span className={`inline-flex items-center gap-1 ${badges[index]}`}>
                          <Award className="h-4 w-4" /> #{index + 1}
                        </span>
                      ) : (
                        <span className="text-slate-500">#{index + 1}</span>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <div className="h-6 w-6 rounded-full bg-slate-800 flex items-center justify-center text-[10px] font-bold text-slate-400 font-mono">
                          {leader.wallet.slice(2, 4).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-white truncate max-w-48 sm:max-w-64">
                            {leader.username || `${leader.wallet.slice(0, 8)}...${leader.wallet.slice(-6)}`}
                          </p>
                          {leader.username && (
                            <p className="text-[9px] text-slate-500 truncate font-mono">
                              {leader.wallet}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-center font-mono text-slate-300">
                      {leader.tradeCount}
                    </td>
                    <td className="px-4 py-4 text-center font-mono font-semibold">
                      <span className="inline-flex items-center gap-1 text-indigo-400">
                        <ShieldCheck className="h-3.5 w-3.5 text-indigo-500" /> {leader.reputation}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right font-mono font-bold text-emerald-400">
                      ${leader.totalVolume.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                );
              })}
              {leaders.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-slate-500">
                    No trade transaction data found on the network.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
