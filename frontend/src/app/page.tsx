"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Search, TrendingUp, DollarSign, Award, ArrowUpRight } from "lucide-react";

interface Market {
  id: number;
  title: string;
  description: string;
  category: string;
  resolved: boolean;
  outcome: number;
  yesPrice: number;
  noPrice: number;
  volume: string;
}

interface Stats {
  marketsCount: number;
  usersCount: number;
  totalVolume: number;
  totalOpenInterest: number;
}

interface Leader {
  wallet: string;
  username: string | null;
  tradeCount: number;
  totalVolume: number;
}

export default function Home() {
  const [markets, setMarkets] = useState<Market[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [leaders, setLeaders] = useState<Leader[]>([]);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [loading, setLoading] = useState(true);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const [marketsRes, statsRes, leadersRes] = await Promise.all([
          fetch(`${API_URL}/markets`),
          fetch(`${API_URL}/admin/stats`),
          fetch(`${API_URL}/leaderboard`)
        ]);

        if (marketsRes.ok) setMarkets(await marketsRes.json());
        if (statsRes.ok) setStats(await statsRes.json());
        if (leadersRes.ok) setLeaders(await leadersRes.json());
      } catch (err) {
        console.error("Error loading home page data:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [API_URL]);

  const categories = ["All", "Crypto", "Politics", "Sports", "Technology"];

  const filteredMarkets = markets.filter((m) => {
    const matchesSearch =
      m.title.toLowerCase().includes(search.toLowerCase()) ||
      m.description.toLowerCase().includes(search.toLowerCase());
    const matchesCategory =
      selectedCategory === "All" || m.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const formatVolume = (val: string) => {
    const amount = parseFloat(val) / 1e6;
    if (amount >= 1000000) return `$${(amount / 1000000).toFixed(1)}M`;
    if (amount >= 1000) return `$${(amount / 1000).toFixed(1)}K`;
    return `$${amount.toFixed(2)}`;
  };

  return (
    <div className="space-y-10">
      {/* Premium Hero Banner */}
      <section className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 px-6 py-12 md:px-12 md:py-16 shadow-2xl">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(59,130,246,0.15),transparent)]"></div>
        <div className="relative z-10 max-w-2xl space-y-4">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/10 px-3 py-1 text-xs font-semibold text-blue-400">
            <TrendingUp className="h-3 w-3" /> Over $1.2M Traded
          </span>
          <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">
            Predict the Future.<br />
            <span className="bg-gradient-to-r from-blue-400 via-indigo-300 to-purple-400 bg-clip-text text-transparent">
              Trade Your Beliefs.
            </span>
          </h1>
          <p className="text-slate-400 max-w-md text-sm md:text-base">
            The world's leading decentralized information market platform. Trade YES/NO shares on real-world events.
          </p>
        </div>
      </section>

      {/* Platform Stats Row */}
      {stats && (
        <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Total Volume", value: `$${(stats.totalVolume).toLocaleString(undefined, { maximumFractionDigits: 2 })}`, icon: DollarSign },
            { label: "Open Interest", value: `$${(stats.totalOpenInterest).toLocaleString(undefined, { maximumFractionDigits: 2 })}`, icon: TrendingUp },
            { label: "Markets Created", value: stats.marketsCount, icon: Award },
            { label: "Active Traders", value: stats.usersCount, icon: Award },
          ].map((s, idx) => (
            <div key={idx} className="glass-panel rounded-xl p-5 border border-border/40">
              <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase">
                {s.label}
                <s.icon className="h-4 w-4 text-blue-500/80" />
              </div>
              <div className="mt-2 text-2xl font-bold tracking-tight text-white">{s.value}</div>
            </div>
          ))}
        </section>
      )}

      {/* Primary Layout Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: Markets list */}
        <div className="lg:col-span-2 space-y-6">
          <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
            {/* Category Tabs */}
            <div className="flex flex-wrap gap-2">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`rounded-lg px-4 py-1.5 text-xs font-semibold tracking-wide transition-all ${
                    selectedCategory === cat
                      ? "bg-blue-600 text-white shadow-md shadow-blue-500/20"
                      : "bg-slate-900 border border-border/50 text-slate-400 hover:text-white"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Search Bar */}
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
              <input
                type="text"
                placeholder="Search markets..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-lg border border-border bg-slate-950 pl-9 pr-4 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-20">
              <svg className="h-8 w-8 animate-spin text-primary" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            </div>
          ) : filteredMarkets.length === 0 ? (
            <div className="text-center py-20 text-slate-500 text-sm">
              No markets found matching the filters.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredMarkets.map((m) => (
                <div
                  key={m.id}
                  className="group relative flex flex-col justify-between rounded-xl border border-border bg-card p-5 transition-all hover:border-blue-500/40 hover:shadow-lg hover:shadow-blue-900/5"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="rounded bg-blue-500/10 px-2 py-0.5 text-[10px] font-bold text-blue-400 uppercase tracking-wide">
                        {m.category}
                      </span>
                      <span className="text-[11px] text-slate-500">
                        {formatVolume(m.volume)} Vol.
                      </span>
                    </div>

                    <Link href={`/market/${m.id}`}>
                      <h3 className="text-base font-semibold leading-snug text-white group-hover:text-blue-400 transition-colors">
                        {m.title}
                      </h3>
                    </Link>

                    <p className="text-xs text-slate-400 line-clamp-2">
                      {m.description}
                    </p>
                  </div>

                  {/* Yes/No Probability Button Grid */}
                  <div className="mt-5 grid grid-cols-2 gap-2">
                    <Link
                      href={`/market/${m.id}?tab=yes`}
                      className="flex items-center justify-between rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 px-3 py-2 text-emerald-400 transition-all font-semibold"
                    >
                      <span className="text-xs">Yes</span>
                      <span className="text-sm font-bold">{(m.yesPrice * 100).toFixed(0)}¢</span>
                    </Link>
                    <Link
                      href={`/market/${m.id}?tab=no`}
                      className="flex items-center justify-between rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 px-3 py-2 text-red-400 transition-all font-semibold"
                    >
                      <span className="text-xs">No</span>
                      <span className="text-sm font-bold">{(m.noPrice * 100).toFixed(0)}¢</span>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right Column: Leaderboard Sidebar */}
        <div className="space-y-6">
          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Award className="h-4 w-4 text-yellow-500" /> Top Traders
            </h3>

            <div className="mt-4 divide-y divide-border/60">
              {leaders.slice(0, 5).map((l, index) => (
                <div key={l.wallet} className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-slate-500 w-4">#{index + 1}</span>
                    <div className="space-y-0.5">
                      <p className="text-xs font-semibold text-white truncate max-w-32">
                        {l.username || `${l.wallet.slice(0, 6)}...${l.wallet.slice(-4)}`}
                      </p>
                      <p className="text-[10px] text-slate-500">{l.tradeCount} trades</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-bold text-emerald-400">
                      ${l.totalVolume.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </span>
                  </div>
                </div>
              ))}
              {leaders.length === 0 && (
                <p className="text-xs text-slate-500 py-3 text-center">No trades recorded yet.</p>
              )}
            </div>

            <Link
              href="/leaderboard"
              className="mt-4 flex items-center justify-center gap-1 w-full rounded-lg border border-border py-2 text-xs font-semibold text-slate-400 hover:text-white transition-colors"
            >
              View Full Leaderboard <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
        </div>

      </div>
    </div>
  );
}
