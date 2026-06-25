"use client";

import React, { useState, useEffect } from "react";
import { useAccount } from "wagmi";
import Link from "next/link";
import { Briefcase, ArrowUpRight, TrendingUp, DollarSign, Clock, Layers } from "lucide-react";

interface Position {
  marketId: number;
  title: string;
  resolved: boolean;
  outcome: number;
  yesShares: number;
  noShares: number;
  yesPrice: number;
  noPrice: number;
  lpBalance: number;
  lpValue: number;
  netInvested: number;
  currentValue: number;
  pnl: number;
  pnlPercent: number;
}

interface PortfolioSummary {
  portfolioValue: number;
  totalInvested: number;
  lpValue: number;
  netPnl: number;
  pnlPercent: number;
}

interface Trade {
  id: string;
  txHash: string;
  marketId: number;
  isYes: boolean;
  isBuy: boolean;
  collateralAmount: string;
  sharesAmount: string;
  price: number;
  timestamp: string;
  market: { title: string };
}

export default function PortfolioPage() {
  const { isConnected, address } = useAccount();
  const [summary, setSummary] = useState<PortfolioSummary | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

  const fetchPortfolioData = async () => {
    if (!address) return;
    try {
      setLoading(true);
      const [portRes, tradeRes] = await Promise.all([
        fetch(`${API_URL}/portfolio/${address}`),
        fetch(`${API_URL}/trades?userWallet=${address}`)
      ]);

      if (portRes.ok) {
        const data = await portRes.json();
        setSummary(data.summary);
        setPositions(data.positions);
      }
      if (tradeRes.ok) {
        setTrades(await tradeRes.json());
      }
    } catch (err) {
      console.error("Error loading portfolio data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isConnected && address) {
      fetchPortfolioData();
    } else {
      setLoading(false);
    }
  }, [isConnected, address]);

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-center space-y-4">
        <Briefcase className="h-12 w-12 text-slate-500" />
        <h2 className="text-xl font-bold text-white">Portfolio Dashboard</h2>
        <p className="text-slate-400 text-sm max-w-sm">
          Please connect your wallet to view your active predictions, open interest, and historical transaction log.
        </p>
      </div>
    );
  }

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
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white flex items-center gap-2">
          <Briefcase className="h-7 w-7 text-blue-500" /> Your Portfolio
        </h1>
        <p className="text-slate-400 text-xs mt-1 truncate">Wallet: {address}</p>
      </div>

      {/* Summary Cards */}
      {summary && (
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { label: "Net Valuation", value: `$${summary.portfolioValue.toFixed(2)}`, icon: DollarSign, sub: "Shares & Liquidity" },
            { label: "Total Cost Basis", value: `$${summary.totalInvested.toFixed(2)}`, icon: Clock, sub: "Net USDC deposited" },
            {
              label: "Net Profit / Loss",
              value: `${summary.netPnl >= 0 ? "+" : ""}$${summary.netPnl.toFixed(2)}`,
              icon: TrendingUp,
              sub: `${summary.pnlPercent.toFixed(1)}% Return`,
              color: summary.netPnl >= 0 ? "text-emerald-400" : "text-red-400"
            },
          ].map((s, idx) => (
            <div key={idx} className="glass-panel rounded-xl p-5 border border-border/40">
              <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase">
                {s.label}
                <s.icon className="h-4 w-4 text-blue-500/80" />
              </div>
              <div className={`mt-2 text-2xl font-bold tracking-tight ${s.color || "text-white"}`}>
                {s.value}
              </div>
              <p className="text-[10px] text-slate-500 mt-1 font-medium">{s.sub}</p>
            </div>
          ))}
        </section>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Active Positions Table */}
        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="border-b border-border bg-slate-900/40 px-5 py-4">
              <h3 className="text-xs uppercase font-extrabold text-slate-300 tracking-wider flex items-center gap-1.5">
                <Layers className="h-4 w-4 text-blue-500" /> Active Positions
              </h3>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-border/60 text-slate-500 uppercase tracking-wider font-semibold">
                    <th className="px-5 py-3.5">Market</th>
                    <th className="px-4 py-3.5">Position</th>
                    <th className="px-4 py-3.5">Total Cost</th>
                    <th className="px-4 py-3.5">Value</th>
                    <th className="px-4 py-3.5 text-right">PnL</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {positions.map((pos) => (
                    <tr key={pos.marketId} className="hover:bg-slate-900/10 transition-colors">
                      <td className="px-5 py-4 font-semibold text-white max-w-xs truncate">
                        <Link href={`/market/${pos.marketId}`} className="hover:text-blue-400 transition-colors">
                          {pos.title}
                        </Link>
                      </td>
                      <td className="px-4 py-4 font-mono">
                        {pos.yesShares > 0 && (
                          <div className="text-emerald-400 font-bold">
                            {pos.yesShares.toFixed(0)} YES @ {(pos.yesPrice * 100).toFixed(0)}¢
                          </div>
                        )}
                        {pos.noShares > 0 && (
                          <div className="text-red-400 font-bold">
                            {pos.noShares.toFixed(0)} NO @ {(pos.noPrice * 100).toFixed(0)}¢
                          </div>
                        )}
                        {pos.lpBalance > 0 && (
                          <div className="text-blue-400">
                            {pos.lpBalance.toFixed(0)} LP Position
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-4 font-mono text-slate-300">${pos.netInvested.toFixed(2)}</td>
                      <td className="px-4 py-4 font-mono text-white">${pos.currentValue.toFixed(2)}</td>
                      <td className={`px-4 py-4 font-mono text-right font-bold ${pos.pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {pos.pnl >= 0 ? "+" : ""}{pos.pnl.toFixed(2)} ({pos.pnlPercent.toFixed(1)}%)
                      </td>
                    </tr>
                  ))}
                  {positions.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-5 py-10 text-center text-slate-500">
                        You do not hold any active share positions or liquidity pool deposits.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Recent Transactions List */}
        <div className="space-y-6">
          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="text-xs uppercase font-extrabold text-slate-300 tracking-wider flex items-center gap-1.5">
              <Clock className="h-4 w-4 text-blue-500" /> Transaction Ledger
            </h3>

            <div className="mt-4 divide-y divide-border/60 max-h-96 overflow-y-auto pr-1">
              {trades.map((t) => {
                const collateral = parseFloat(formatUnits(BigInt(t.collateralAmount), 6));
                const shares = parseFloat(formatUnits(BigInt(t.sharesAmount), 6));
                return (
                  <div key={t.id} className="py-3 flex items-start justify-between gap-3 text-xs">
                    <div className="space-y-0.5 min-w-0">
                      <p className="font-semibold text-white truncate max-w-40" title={t.market.title}>
                        {t.market.title}
                      </p>
                      <p className="text-[10px] text-slate-500 flex gap-1.5 items-center">
                        <span className={`font-bold uppercase ${t.isBuy ? "text-emerald-400" : "text-red-400"}`}>
                          {t.isBuy ? "Buy" : "Sell"}
                        </span>
                        <span className={`rounded-sm px-1 text-[9px] font-bold ${t.isYes ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}`}>
                          {t.isYes ? "YES" : "NO"}
                        </span>
                        <span>{new Date(t.timestamp).toLocaleDateString()}</span>
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0 font-mono">
                      <p className="font-bold text-white">${collateral.toFixed(2)}</p>
                      <p className="text-[10px] text-slate-500">{shares.toFixed(0)} shares</p>
                    </div>
                  </div>
                );
              })}
              {trades.length === 0 && (
                <p className="text-xs text-slate-500 py-6 text-center">No transactions recorded.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
