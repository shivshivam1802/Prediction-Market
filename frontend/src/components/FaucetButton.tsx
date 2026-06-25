"use client";

import React, { useState } from "react";
import { useAccount, useWriteContract } from "wagmi";
import { USDC_ADDRESS, MockUSDCABI } from "@/lib/contracts";

export default function FaucetButton() {
  const { isConnected, address } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleClaim = async () => {
    if (!isConnected || !address) return;
    setLoading(true);
    setSuccess(false);

    try {
      // Mint 1000 USDC (6 decimals = 1,000,000,000)
      const amount = BigInt(1000 * 10 ** 6);
      
      const tx = await writeContractAsync({
        address: USDC_ADDRESS,
        abi: MockUSDCABI,
        functionName: "mint",
        args: [address, amount],
      });

      console.log("Faucet transaction submitted:", tx);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (error) {
      console.error("Failed to claim USDC faucet:", error);
      alert("Failed to claim USDC from faucet. Make sure your wallet is connected to the correct network.");
    } finally {
      setLoading(false);
    }
  };

  if (!isConnected) return null;

  return (
    <button
      onClick={handleClaim}
      disabled={loading}
      className={`relative inline-flex items-center justify-center rounded-lg px-4 py-2 text-xs font-semibold tracking-wide transition-all shadow-md active:scale-95 disabled:pointer-events-none disabled:opacity-50 ${
        success
          ? "bg-emerald-500 text-white"
          : "bg-indigo-600 text-white hover:bg-indigo-500 hover:shadow-indigo-500/20"
      }`}
    >
      {loading ? (
        <span className="flex items-center gap-1">
          <svg className="h-4 w-4 animate-spin text-white" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          Claiming...
        </span>
      ) : success ? (
        "✓ 1,000 USDC Claimed!"
      ) : (
        "Claim Faucet"
      )}
    </button>
  );
}
