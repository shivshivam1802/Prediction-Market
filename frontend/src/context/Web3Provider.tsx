"use client";

import React from "react";
import "@rainbow-me/rainbowkit/styles.css";
import { getDefaultConfig, RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import { WagmiProvider } from "wagmi";
import { hardhat, polygon } from "wagmi/chains";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";

// A dummy projectId is sufficient for local development and testing
const config = getDefaultConfig({
  appName: "PredictX - Prediction Markets",
  projectId: "9b3cf2860d2d3a39e80e95ff14c81fbc",
  chains: [hardhat, polygon],
  ssr: true,
});

const queryClient = new QueryClient();

export function Web3Provider({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={darkTheme({
          accentColor: "#3b82f6",
          accentColorForeground: "white",
          borderRadius: "medium",
        })}>
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
