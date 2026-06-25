"use client";

import React, { useState, useEffect } from "react";
import { useAccount, useWriteContract } from "wagmi";
import { MANAGER_ADDRESS, PredictionMarketManagerABI } from "@/lib/contracts";
import { parseUnits } from "viem";
import { Shield, PlusCircle, CheckCircle, RefreshCw } from "lucide-react";

interface UnresolvedMarket {
  id: number;
  title: string;
  category: string;
  expirationTimestamp: string;
}

export default function AdminPage() {
  const { isConnected, address } = useAccount();
  const { writeContractAsync } = useWriteContract();

  // Create market form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("Crypto");
  const [expiration, setExpiration] = useState("");
  const [oracleUrl, setOracleUrl] = useState("");

  // Resolve market form state
  const [markets, setMarkets] = useState<UnresolvedMarket[]>([]);
  const [selectedMarketId, setSelectedMarketId] = useState("");
  const [outcome, setOutcome] = useState("1"); // 1: YES, 2: NO, 3: Invalid

  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

  const fetchUnresolvedMarkets = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_URL}/markets?resolved=false`);
      if (res.ok) {
        setMarkets(await res.json());
      }
    } catch (err) {
      console.error("Error loading unresolved markets:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUnresolvedMarkets();
  }, []);

  const handleCreateMarket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isConnected) return alert("Connect wallet first");
    if (!title || !description || !expiration || !oracleUrl) return alert("Fill in all fields");

    setActionLoading(true);
    try {
      const expTimestamp = Math.floor(new Date(expiration).getTime() / 1000);
      if (expTimestamp <= Math.floor(Date.now() / 1000)) {
        return alert("Expiration date must be in the future");
      }

      console.log("Creating market on-chain...");
      const tx = await writeContractAsync({
        address: MANAGER_ADDRESS,
        abi: PredictionMarketManagerABI,
        functionName: "createMarket",
        args: [title, description, category, BigInt(expTimestamp), oracleUrl],
      });

      console.log("Create market tx submitted:", tx);
      alert("Market created successfully!");
      setTitle("");
      setDescription("");
      setExpiration("");
      setOracleUrl("");
      
      // Wait for indexer to sync
      await new Promise((resolve) => setTimeout(resolve, 3000));
      fetchUnresolvedMarkets();
    } catch (err: any) {
      console.error("Failed to create market:", err);
      alert(`Create market failed: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleResolveMarket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isConnected) return alert("Connect wallet first");
    if (!selectedMarketId) return alert("Select a market");

    setActionLoading(true);
    try {
      console.log(`Resolving market ${selectedMarketId} to outcome ${outcome}...`);
      const tx = await writeContractAsync({
        address: MANAGER_ADDRESS,
        abi: PredictionMarketManagerABI,
        functionName: "resolveMarket",
        args: [BigInt(selectedMarketId), parseInt(outcome)],
      });

      console.log("Resolve market tx submitted:", tx);
      alert("Market resolved successfully!");
      setSelectedMarketId("");
      
      await new Promise((resolve) => setTimeout(resolve, 3000));
      fetchUnresolvedMarkets();
    } catch (err: any) {
      console.error("Failed to resolve market:", err);
      alert(`Resolve market failed: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white flex items-center gap-2">
          <Shield className="h-7 w-7 text-indigo-500" /> Admin Dashboard
        </h1>
        <p className="text-slate-400 text-xs mt-1">
          Perform administrative and maintenance tasks like creating markets and resolving disputes.
        </p>
      </div>

      {/* Contract Owner Alert */}
      <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-4 text-xs text-indigo-300 leading-relaxed">
        <strong>Note:</strong> You must connect the contract owner wallet (typically the Hardhat deployer/account 0: <code className="text-white font-mono bg-indigo-950 px-1 rounded">0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266</code>) to perform these operations. Other addresses will cause transactions to fail.
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        
        {/* Create Market Form */}
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <PlusCircle className="h-4 w-4 text-blue-500" /> Create Market
          </h2>

          <form onSubmit={handleCreateMarket} className="space-y-3.5 text-xs">
            <div className="space-y-1">
              <label className="text-slate-400 font-semibold">Title</label>
              <input
                type="text"
                placeholder="Will Ethereum reach $5,000 by..."
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-lg border border-border bg-slate-950 px-3 py-2 text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div className="space-y-1">
              <label className="text-slate-400 font-semibold">Description</label>
              <textarea
                placeholder="Detail the terms and conditions..."
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full rounded-lg border border-border bg-slate-950 px-3 py-2 text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-slate-400 font-semibold">Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full rounded-lg border border-border bg-slate-950 px-3 py-2 text-white focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  {["Crypto", "Politics", "Sports", "Technology"].map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-slate-400 font-semibold">Expiration Date</label>
                <input
                  type="datetime-local"
                  value={expiration}
                  onChange={(e) => setExpiration(e.target.value)}
                  className="w-full rounded-lg border border-border bg-slate-950 px-3 py-2 text-white focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-slate-400 font-semibold">Oracle Verification URL</label>
              <input
                type="text"
                placeholder="https://api.coingecko.com"
                value={oracleUrl}
                onChange={(e) => setOracleUrl(e.target.value)}
                className="w-full rounded-lg border border-border bg-slate-950 px-3 py-2 text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <button
              type="submit"
              disabled={actionLoading}
              className="w-full rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold py-2.5 shadow-md flex items-center justify-center gap-1.5 transition-all disabled:opacity-50"
            >
              {actionLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : "Deploy Market"}
            </button>
          </form>
        </div>

        {/* Resolve Market Form */}
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-emerald-500" /> Resolve Market
          </h2>

          <form onSubmit={handleResolveMarket} className="space-y-4 text-xs">
            <div className="space-y-1">
              <label className="text-slate-400 font-semibold">Select Market</label>
              {loading ? (
                <div className="py-2 text-slate-500">Loading markets...</div>
              ) : (
                <select
                  value={selectedMarketId}
                  onChange={(e) => setSelectedMarketId(e.target.value)}
                  className="w-full rounded-lg border border-border bg-slate-950 px-3 py-2 text-white focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="">-- Choose Market --</option>
                  {markets.map((m) => (
                    <option key={m.id} value={m.id}>
                      #{m.id} - {m.title}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="space-y-1">
              <label className="text-slate-400 font-semibold">Outcome</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { value: "1", label: "YES" },
                  { value: "2", label: "NO" },
                  { value: "3", label: "INVALID (Refund)" },
                ].map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => setOutcome(o.value)}
                    className={`rounded-lg py-2.5 font-bold transition-all border ${
                      outcome === o.value
                        ? "bg-indigo-600 text-white border-indigo-500"
                        : "bg-slate-950 border-border/40 text-slate-400 hover:text-white"
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="submit"
              disabled={actionLoading || !selectedMarketId}
              className="w-full rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-2.5 shadow-md flex items-center justify-center gap-1.5 transition-all disabled:opacity-50"
            >
              {actionLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : "Resolve Market"}
            </button>
          </form>
        </div>

      </div>
    </div>
  );
}
