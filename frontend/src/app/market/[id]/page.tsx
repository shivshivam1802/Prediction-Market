"use client";

import React, { useState, useEffect, use } from "react";
import { useAccount, useReadContract, useWriteContract } from "wagmi";
import { MANAGER_ADDRESS, USDC_ADDRESS, MockUSDCABI, PredictionMarketManagerABI } from "@/lib/contracts";
import { formatUnits, parseUnits } from "viem";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";
import { ArrowLeft, MessageSquare, Plus, RefreshCw, Send, Shield, Info } from "lucide-react";
import Link from "next/link";

interface PageProps {
  params: Promise<{ id: string }>;
}

interface PricePoint {
  timestamp: string;
  yesPrice: number;
  noPrice: number;
}

interface MarketDetails {
  id: number;
  title: string;
  description: string;
  category: string;
  expirationTimestamp: string;
  resolved: boolean;
  outcome: number;
  yesPrice: number;
  noPrice: number;
  volume: string;
  openInterest: string;
  oracleUrl: string;
  priceHistory: PricePoint[];
  comments: any[];
}

export default function MarketPage({ params }: PageProps) {
  const { id: rawId } = use(params);
  const marketId = parseInt(rawId);
  const { isConnected, address } = useAccount();
  const { writeContractAsync } = useWriteContract();

  // Component states
  const [market, setMarket] = useState<MarketDetails | null>(null);
  const [tradeTab, setTradeTab] = useState<"buy" | "sell">("buy");
  const [outcomeSelection, setOutcomeSelection] = useState<"yes" | "no">("yes");
  const [tradeAmount, setTradeAmount] = useState("");
  const [liquidityAmount, setLiquidityAmount] = useState("");
  const [lpRemoveAmount, setLpRemoveAmount] = useState("");
  const [commentText, setCommentText] = useState("");
  const [activeSidePanel, setActiveSidePanel] = useState<"trade" | "liquidity">("trade");
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

  // Load market details from backend
  const loadMarket = async () => {
    try {
      const res = await fetch(`${API_URL}/markets/${marketId}`);
      if (res.ok) {
        const data = await res.json();
        setMarket(data);
      }
    } catch (err) {
      console.error("Error fetching market detail:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMarket();
  }, [marketId]);

  // Contract reads: user YES/NO balances and LP balances
  const { data: yesBalanceRaw, refetch: refetchYes } = useReadContract({
    address: MANAGER_ADDRESS,
    abi: PredictionMarketManagerABI,
    functionName: "yesShares",
    args: [BigInt(marketId), address || "0x0000000000000000000000000000000000000000"],
    query: { enabled: !!address }
  });

  const { data: noBalanceRaw, refetch: refetchNo } = useReadContract({
    address: MANAGER_ADDRESS,
    abi: PredictionMarketManagerABI,
    functionName: "noShares",
    args: [BigInt(marketId), address || "0x0000000000000000000000000000000000000000"],
    query: { enabled: !!address }
  });

  const { data: lpBalanceRaw, refetch: refetchLp } = useReadContract({
    address: MANAGER_ADDRESS,
    abi: PredictionMarketManagerABI,
    functionName: "lpBalances",
    args: [BigInt(marketId), address || "0x0000000000000000000000000000000000000000"],
    query: { enabled: !!address }
  });

  const { data: usdcBalanceRaw, refetch: refetchUsdc } = useReadContract({
    address: USDC_ADDRESS,
    abi: MockUSDCABI,
    functionName: "balanceOf",
    args: [address || "0x0000000000000000000000000000000000000000"],
    query: { enabled: !!address }
  });

  const { data: allowanceRaw, refetch: refetchAllowance } = useReadContract({
    address: USDC_ADDRESS,
    abi: MockUSDCABI,
    functionName: "allowance",
    args: [address || "0x0000000000000000000000000000000000000000", MANAGER_ADDRESS],
    query: { enabled: !!address }
  });

  const yesShares = yesBalanceRaw ? parseFloat(formatUnits(yesBalanceRaw, 6)) : 0;
  const noShares = noBalanceRaw ? parseFloat(formatUnits(noBalanceRaw, 6)) : 0;
  const lpBalance = lpBalanceRaw ? parseFloat(formatUnits(lpBalanceRaw, 6)) : 0;
  const usdcBalance = usdcBalanceRaw ? parseFloat(formatUnits(usdcBalanceRaw, 6)) : 0;
  const allowance = allowanceRaw ? parseFloat(formatUnits(allowanceRaw, 6)) : 0;

  // Swap estimations
  const getEstimation = () => {
    if (!market || !tradeAmount || isNaN(parseFloat(tradeAmount))) return { estimate: 0, price: 0 };
    const amt = parseFloat(tradeAmount);
    const yPool = parseFloat(market.yesSharesPool) / 1e6;
    const nPool = parseFloat(market.noSharesPool) / 1e6;

    if (tradeTab === "buy") {
      const fee = amt * 0.01;
      const tradeAmountNet = amt - fee;
      if (outcomeSelection === "yes") {
        // dy = tradeAmountNet * (1 + yPool / (nPool + tradeAmountNet))
        const shares = tradeAmountNet * (1 + yPool / (nPool + tradeAmountNet));
        return { estimate: shares, price: amt / shares };
      } else {
        const shares = tradeAmountNet * (1 + nPool / (yPool + tradeAmountNet));
        return { estimate: shares, price: amt / shares };
      }
    } else {
      // Sell estimation requires solving quadratic formula
      // Let's approximate price based on current market rate for simplicity of preview
      const price = outcomeSelection === "yes" ? market.yesPrice : market.noPrice;
      const fee = (amt * price) * 0.01;
      const returns = (amt * price) - fee;
      return { estimate: returns, price };
    }
  };

  const { estimate, price: estPrice } = getEstimation();

  // Trade submission handler
  const handleTrade = async () => {
    if (!isConnected || !market) return alert("Please connect wallet first");
    const amountFloat = parseFloat(tradeAmount);
    if (isNaN(amountFloat) || amountFloat <= 0) return alert("Enter valid amount");

    setActionLoading(true);
    try {
      if (tradeTab === "buy") {
        const amountWei = parseUnits(tradeAmount, 6);

        // Check allowance and approve if needed
        if (allowance < amountFloat) {
          console.log("Approving manager contract for USDC...");
          const approveTx = await writeContractAsync({
            address: USDC_ADDRESS,
            abi: MockUSDCABI,
            functionName: "approve",
            args: [MANAGER_ADDRESS, ethers.MaxUint256],
          });
          console.log("Approval transaction submitted:", approveTx);
          // Wait briefly for allowance to sync
          await new Promise((resolve) => setTimeout(resolve, 5000));
          await refetchAllowance();
        }

        const isYes = outcomeSelection === "yes";
        console.log(`Buying ${isYes ? "YES" : "NO"} shares...`);

        await writeContractAsync({
          address: MANAGER_ADDRESS,
          abi: PredictionMarketManagerABI,
          functionName: isYes ? "buyYes" : "buyNo",
          args: [BigInt(marketId), amountWei, 0n], // 0 minimum slippage for simplicity
        });

      } else {
        const sharesWei = parseUnits(tradeAmount, 6);
        const isYes = outcomeSelection === "yes";
        console.log(`Selling ${isYes ? "YES" : "NO"} shares...`);

        await writeContractAsync({
          address: MANAGER_ADDRESS,
          abi: PredictionMarketManagerABI,
          functionName: isYes ? "sellYes" : "sellNo",
          args: [BigInt(marketId), sharesWei, 0n],
        });
      }

      setTradeAmount("");
      alert("Transaction completed successfully!");
      
      // Wait for backend indexing to pick up events before refetch
      await new Promise((resolve) => setTimeout(resolve, 3000));
      await Promise.all([loadMarket(), refetchYes(), refetchNo(), refetchUsdc(), refetchLp()]);
    } catch (err: any) {
      console.error("Trade failed:", err);
      alert(`Trade failed: ${err.message || err.toString()}`);
    } finally {
      setActionLoading(false);
    }
  };

  // Liquidity handlers
  const handleAddLiquidity = async () => {
    if (!isConnected || !market) return;
    const amountFloat = parseFloat(liquidityAmount);
    if (isNaN(amountFloat) || amountFloat <= 0) return;

    setActionLoading(true);
    try {
      const amountWei = parseUnits(liquidityAmount, 6);

      if (allowance < amountFloat) {
        await writeContractAsync({
          address: USDC_ADDRESS,
          abi: MockUSDCABI,
          functionName: "approve",
          args: [MANAGER_ADDRESS, ethers.MaxUint256],
        });
        await new Promise((resolve) => setTimeout(resolve, 5000));
        await refetchAllowance();
      }

      await writeContractAsync({
        address: MANAGER_ADDRESS,
        abi: PredictionMarketManagerABI,
        functionName: "addLiquidity",
        args: [BigInt(marketId), amountWei],
      });

      setLiquidityAmount("");
      alert("Liquidity added successfully!");
      await new Promise((resolve) => setTimeout(resolve, 3000));
      await Promise.all([loadMarket(), refetchLp(), refetchUsdc()]);
    } catch (err: any) {
      alert(`Add liquidity failed: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleRemoveLiquidity = async () => {
    if (!isConnected || !market) return;
    const amountFloat = parseFloat(lpRemoveAmount);
    if (isNaN(amountFloat) || amountFloat <= 0 || amountFloat > lpBalance) return;

    setActionLoading(true);
    try {
      const amountWei = parseUnits(lpRemoveAmount, 6);

      await writeContractAsync({
        address: MANAGER_ADDRESS,
        abi: PredictionMarketManagerABI,
        functionName: "removeLiquidity",
        args: [BigInt(marketId), amountWei],
      });

      setLpRemoveAmount("");
      alert("Liquidity removed successfully!");
      await new Promise((resolve) => setTimeout(resolve, 3000));
      await Promise.all([loadMarket(), refetchLp(), refetchYes(), refetchNo(), refetchUsdc()]);
    } catch (err: any) {
      alert(`Remove liquidity failed: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  // Claim payout
  const handleClaim = async () => {
    if (!isConnected) return;
    setActionLoading(true);
    try {
      await writeContractAsync({
        address: MANAGER_ADDRESS,
        abi: PredictionMarketManagerABI,
        functionName: "claimWinnings",
        args: [BigInt(marketId)],
      });
      alert("Payout claimed successfully!");
      await new Promise((resolve) => setTimeout(resolve, 3000));
      await Promise.all([loadMarket(), refetchYes(), refetchNo(), refetchLp(), refetchUsdc()]);
    } catch (err: any) {
      alert(`Claim failed: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  // Post comment
  const handlePostComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isConnected || !address || !commentText.trim()) return;

    try {
      const res = await fetch(`${API_URL}/markets/${marketId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userWallet: address, content: commentText })
      });
      if (res.ok) {
        setCommentText("");
        loadMarket();
      }
    } catch (err) {
      console.error("Comment failed:", err);
    }
  };

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

  if (!market) {
    return <div className="text-center py-20 text-slate-500">Market not found.</div>;
  }

  return (
    <div className="space-y-6">
      {/* Back button */}
      <Link href="/" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors">
        <ArrowLeft className="h-4 w-4" /> Back to markets
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main section: Chart, descriptions, comments */}
        <div className="lg:col-span-2 space-y-6">
          <div className="space-y-3">
            <span className="rounded bg-blue-500/10 px-2 py-0.5 text-xs font-bold text-blue-400 uppercase tracking-wide">
              {market.category}
            </span>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white leading-tight">
              {market.title}
            </h1>
            <p className="text-slate-400 text-sm leading-relaxed">{market.description}</p>
          </div>

          {/* Recharts Price Chart */}
          <div className="rounded-xl border border-border bg-card p-5 h-80 flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-semibold text-white">Price History (YES Share)</span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-500"></span> Current: {(market.yesPrice * 100).toFixed(0)}¢
              </span>
            </div>
            
            <div className="flex-1 mt-4">
              {market.priceHistory.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={market.priceHistory}>
                    <XAxis dataKey="timestamp" stroke="#64748b" fontSize={10} tickLine={false} />
                    <YAxis domain={[0, 1]} stroke="#64748b" fontSize={10} tickFormatter={(val) => `${(val * 100).toFixed(0)}¢`} tickLine={false} />
                    <Tooltip contentStyle={{ background: "#0b1528", border: "1px solid #1e293b", borderRadius: "8px" }} />
                    <Line type="monotone" dataKey="yesPrice" name="YES" stroke="#10b981" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-slate-500 text-xs">
                  Insufficient trading data to generate chart.
                </div>
              )}
            </div>
          </div>

          {/* Market Stats Grid */}
          <div className="grid grid-cols-3 gap-4 rounded-xl border border-border bg-card p-4">
            <div className="text-center">
              <p className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Volume</p>
              <p className="mt-1 text-base font-extrabold text-white">
                ${(parseFloat(market.volume) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </p>
            </div>
            <div className="text-center border-x border-border/60">
              <p className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Open Interest</p>
              <p className="mt-1 text-base font-extrabold text-white">
                ${(parseFloat(market.openInterest) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </p>
            </div>
            <div className="text-center">
              <p className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Status</p>
              <p className={`mt-1 text-xs font-extrabold uppercase ${market.resolved ? "text-red-400" : "text-emerald-400"}`}>
                {market.resolved ? "Resolved" : "Active"}
              </p>
            </div>
          </div>

          {/* Rules / Resolution Criteria */}
          <div className="rounded-xl border border-border bg-card p-5 space-y-3">
            <h3 className="text-xs uppercase font-extrabold text-slate-300 flex items-center gap-1.5 tracking-wider">
              <Shield className="h-4 w-4 text-blue-500" /> Resolution Source & Rules
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              This market resolves based on information published at:{" "}
              <a href={market.oracleUrl} target="_blank" rel="noreferrer" className="text-blue-400 underline hover:text-blue-300">
                {market.oracleUrl}
              </a>
              . Disputes are settled via admin resolution if data sources become unavailable or contradictory.
            </p>
          </div>

          {/* Comments Section */}
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-blue-500" /> Discussion ({market.comments.length})
            </h3>
            
            {isConnected ? (
              <form onSubmit={handlePostComment} className="flex gap-2">
                <input
                  type="text"
                  placeholder="Share your thoughts..."
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  className="flex-1 rounded-lg border border-border bg-slate-950 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <button
                  type="submit"
                  className="rounded-lg bg-blue-600 hover:bg-blue-500 text-white px-4 flex items-center justify-center shadow-md shadow-blue-500/10"
                >
                  <Send className="h-4 w-4" />
                </button>
              </form>
            ) : (
              <p className="text-xs text-slate-500 bg-slate-900 border border-border/40 rounded-lg p-3">
                Please connect your wallet to post comments.
              </p>
            )}

            <div className="space-y-3">
              {market.comments.map((c) => (
                <div key={c.id} className="rounded-xl border border-border bg-card/40 p-4 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-blue-400 truncate max-w-40">
                      {c.user.username || `${c.userWallet.slice(0, 6)}...${c.userWallet.slice(-4)}`}
                    </span>
                    <span className="text-[10px] text-slate-500">
                      {new Date(c.timestamp).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 leading-normal">{c.content}</p>
                </div>
              ))}
              {market.comments.length === 0 && (
                <p className="text-xs text-slate-500 py-6 text-center">Be the first to comment!</p>
              )}
            </div>
          </div>
        </div>

        {/* Right section: Trade / Liquidity Panels */}
        <div className="space-y-6">
          
          {/* Resolved Announcement Banner */}
          {market.resolved && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-5 text-center space-y-3">
              <p className="text-sm font-bold text-red-400">Market Resolved</p>
              <p className="text-xs text-slate-400">
                Winning Outcome: <span className="font-bold text-white">{market.outcome === 1 ? "YES" : market.outcome === 2 ? "NO" : "Invalid/Cancelled"}</span>
              </p>
              {(yesShares > 0 || noShares > 0 || lpBalance > 0) && (
                <button
                  onClick={handleClaim}
                  disabled={actionLoading}
                  className="w-full rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs py-2.5 transition-all shadow-md"
                >
                  Claim Payout
                </button>
              )}
            </div>
          )}

          {/* Trade & Liquidity panel tabs */}
          {!market.resolved && (
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="grid grid-cols-2 border-b border-border text-center">
                <button
                  onClick={() => setActiveSidePanel("trade")}
                  className={`py-3 text-xs uppercase font-extrabold tracking-wider transition-colors ${
                    activeSidePanel === "trade"
                      ? "bg-slate-900/60 text-white border-b-2 border-blue-500"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  Trade
                </button>
                <button
                  onClick={() => setActiveSidePanel("liquidity")}
                  className={`py-3 text-xs uppercase font-extrabold tracking-wider transition-colors ${
                    activeSidePanel === "liquidity"
                      ? "bg-slate-900/60 text-white border-b-2 border-blue-500"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  Liquidity
                </button>
              </div>

              <div className="p-5 space-y-6">
                
                {/* 1. TRADE PANEL */}
                {activeSidePanel === "trade" && (
                  <div className="space-y-4">
                    {/* Buy/Sell selector */}
                    <div className="grid grid-cols-2 gap-1.5 bg-slate-950 p-1 rounded-lg border border-border/40">
                      <button
                        onClick={() => setTradeTab("buy")}
                        className={`rounded px-3 py-1.5 text-xs font-bold transition-all ${
                          tradeTab === "buy" ? "bg-slate-900 text-white" : "text-slate-500 hover:text-white"
                        }`}
                      >
                        Buy
                      </button>
                      <button
                        onClick={() => setTradeTab("sell")}
                        className={`rounded px-3 py-1.5 text-xs font-bold transition-all ${
                          tradeTab === "sell" ? "bg-slate-900 text-white" : "text-slate-500 hover:text-white"
                        }`}
                      >
                        Sell
                      </button>
                    </div>

                    {/* Outcome Choice (Yes/No) */}
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => setOutcomeSelection("yes")}
                        className={`rounded-lg py-2.5 text-xs font-extrabold uppercase transition-all ${
                          outcomeSelection === "yes"
                            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                            : "bg-slate-950 border border-border/30 text-slate-500 hover:text-slate-400"
                        }`}
                      >
                        Yes ({(market.yesPrice * 100).toFixed(0)}¢)
                      </button>
                      <button
                        onClick={() => setOutcomeSelection("no")}
                        className={`rounded-lg py-2.5 text-xs font-extrabold uppercase transition-all ${
                          outcomeSelection === "no"
                            ? "bg-red-500/10 text-red-400 border border-red-500/30"
                            : "bg-slate-950 border border-border/30 text-slate-500 hover:text-slate-400"
                        }`}
                      >
                        No ({(market.noPrice * 100).toFixed(0)}¢)
                      </button>
                    </div>

                    {/* Amount Input */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-[11px] text-slate-500">
                        <span>Amount</span>
                        <span>
                          {tradeTab === "buy"
                            ? `Bal: ${usdcBalance.toFixed(2)} USDC`
                            : `Held: ${outcomeSelection === "yes" ? yesShares.toFixed(2) : noShares.toFixed(2)} shares`}
                        </span>
                      </div>
                      <div className="relative">
                        <input
                          type="number"
                          placeholder="0.00"
                          value={tradeAmount}
                          onChange={(e) => setTradeAmount(e.target.value)}
                          className="w-full rounded-lg border border-border bg-slate-950 pl-4 pr-16 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-primary font-mono font-semibold"
                        />
                        <span className="absolute right-4 top-3 text-xs font-bold text-slate-500 font-mono">
                          {tradeTab === "buy" ? "USDC" : "Shares"}
                        </span>
                      </div>
                    </div>

                    {/* Swap summary estimates */}
                    {tradeAmount && !isNaN(parseFloat(tradeAmount)) && (
                      <div className="rounded-lg bg-slate-950 p-3 border border-border/30 text-xs space-y-2">
                        <div className="flex justify-between">
                          <span className="text-slate-500">Est. Shares</span>
                          <span className="font-bold text-white">{estimate.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Average Price</span>
                          <span className="font-bold text-white">{(estPrice * 100).toFixed(1)}¢</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Fee (1%)</span>
                          <span className="font-bold text-white">
                            {tradeTab === "buy"
                              ? `$${(parseFloat(tradeAmount) * 0.01).toFixed(2)}`
                              : `$${(estimate * 0.01).toFixed(2)}`}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Execute action button */}
                    <button
                      onClick={handleTrade}
                      disabled={actionLoading || !tradeAmount}
                      className="w-full rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs py-3 tracking-wider transition-all disabled:opacity-50 flex items-center justify-center gap-1.5"
                    >
                      {actionLoading ? (
                        <>
                          <RefreshCw className="h-3 w-3 animate-spin" /> Submitting...
                        </>
                      ) : tradeTab === "buy" ? (
                        allowance < parseFloat(tradeAmount || "0") ? "Approve & Buy" : `Buy ${outcomeSelection.toUpperCase()}`
                      ) : (
                        `Sell ${outcomeSelection.toUpperCase()}`
                      )}
                    </button>
                  </div>
                )}

                {/* 2. LIQUIDITY PANEL */}
                {activeSidePanel === "liquidity" && (
                  <div className="space-y-6">
                    {/* Add Liquidity section */}
                    <div className="space-y-3">
                      <div className="flex justify-between items-center text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        <span>Add Liquidity</span>
                        <span className="font-normal normal-case font-mono text-[11px] text-slate-500">
                          Bal: {usdcBalance.toFixed(2)} USDC
                        </span>
                      </div>
                      <div className="relative">
                        <input
                          type="number"
                          placeholder="Amount"
                          value={liquidityAmount}
                          onChange={(e) => setLiquidityAmount(e.target.value)}
                          className="w-full rounded-lg border border-border bg-slate-950 pl-4 pr-16 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary font-mono"
                        />
                        <span className="absolute right-4 top-2.5 text-xs text-slate-500 font-mono">USDC</span>
                      </div>
                      <button
                        onClick={handleAddLiquidity}
                        disabled={actionLoading || !liquidityAmount}
                        className="w-full rounded-lg bg-slate-900 border border-border/80 hover:text-white text-slate-300 font-semibold text-xs py-2 transition-all"
                      >
                        {actionLoading ? "Processing..." : "Deposit Liquidity"}
                      </button>
                    </div>

                    {/* Remove Liquidity section */}
                    {lpBalance > 0 && (
                      <div className="space-y-3 pt-4 border-t border-border/60">
                        <div className="flex justify-between items-center text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                          <span>Remove Liquidity</span>
                          <span className="font-normal normal-case font-mono text-[11px] text-slate-500">
                            Pool LP: {lpBalance.toFixed(2)} LP
                          </span>
                        </div>
                        <div className="relative">
                          <input
                            type="number"
                            placeholder="LP Amount"
                            value={lpRemoveAmount}
                            onChange={(e) => setLpRemoveAmount(e.target.value)}
                            className="w-full rounded-lg border border-border bg-slate-950 pl-4 pr-16 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary font-mono"
                          />
                          <span className="absolute right-4 top-2.5 text-xs text-slate-500 font-mono">LP</span>
                        </div>
                        <button
                          onClick={handleRemoveLiquidity}
                          disabled={actionLoading || !lpRemoveAmount}
                          className="w-full rounded-lg bg-red-950/20 hover:bg-red-950/40 border border-red-500/20 text-red-400 font-semibold text-xs py-2 transition-all"
                        >
                          {actionLoading ? "Processing..." : "Withdraw Liquidity"}
                        </button>
                      </div>
                    )}
                  </div>
                )}

              </div>
            </div>
          )}

          {/* User Portfolio in this specific market */}
          {isConnected && (yesShares > 0 || noShares > 0 || lpBalance > 0) && (
            <div className="rounded-xl border border-border bg-card p-5 space-y-4">
              <h3 className="text-xs uppercase font-extrabold text-slate-300 tracking-wider flex items-center gap-1.5">
                <Info className="h-4 w-4 text-blue-500" /> Your Position
              </h3>
              
              <div className="text-xs space-y-2.5 divide-y divide-border/40">
                {yesShares > 0 && (
                  <div className="flex justify-between pt-2.5">
                    <span className="text-slate-500">YES Shares</span>
                    <span className="font-bold text-emerald-400 font-mono">{yesShares.toFixed(2)}</span>
                  </div>
                )}
                {noShares > 0 && (
                  <div className="flex justify-between pt-2.5">
                    <span className="text-slate-500">NO Shares</span>
                    <span className="font-bold text-red-400 font-mono">{noShares.toFixed(2)}</span>
                  </div>
                )}
                {lpBalance > 0 && (
                  <div className="flex justify-between pt-2.5">
                    <span className="text-slate-500">LP Shares</span>
                    <span className="font-bold text-blue-400 font-mono">{lpBalance.toFixed(2)}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
