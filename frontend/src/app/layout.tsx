import type { Metadata } from "next";
import { Web3Provider } from "../context/Web3Provider";
import "./globals.css";
import Link from "next/link";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import FaucetButton from "@/components/FaucetButton";

export const metadata: Metadata = {
  title: "PredictX | Decentralized Prediction Markets",
  description: "Trade on politics, sports, crypto, technology, and entertainment. PredictX is a production-grade decentralized prediction market platform.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="flex flex-col min-h-screen bg-background text-foreground antialiased selection:bg-primary selection:text-white">
        <Web3Provider>
          {/* Header */}
          <header className="sticky top-0 z-40 w-full border-b border-border bg-background/80 backdrop-blur-md">
            <div className="container mx-auto flex h-16 items-center justify-between px-4 sm:px-6">
              <div className="flex items-center gap-6">
                <Link href="/" className="flex items-center space-x-2">
                  <span className="bg-gradient-to-r from-blue-500 via-indigo-400 to-purple-500 bg-clip-text text-2xl font-black tracking-tight text-transparent">
                    PREDICTX
                  </span>
                </Link>
                <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
                  <Link href="/" className="transition-colors hover:text-primary">
                    Markets
                  </Link>
                  <Link href="/portfolio" className="transition-colors hover:text-primary">
                    Portfolio
                  </Link>
                  <Link href="/leaderboard" className="transition-colors hover:text-primary">
                    Leaderboard
                  </Link>
                  <Link href="/admin" className="transition-colors hover:text-primary">
                    Admin
                  </Link>
                </nav>
              </div>

              <div className="flex items-center gap-3">
                <FaucetButton />
                <ConnectButton showBalance={false} chainStatus="none" accountStatus="avatar" />
              </div>
            </div>
          </header>

          {/* Main Content */}
          <main className="flex-1 container mx-auto px-4 py-8 sm:px-6">
            {children}
          </main>

          {/* Footer */}
          <footer className="w-full border-t border-border bg-background py-6">
            <div className="container mx-auto flex flex-col sm:flex-row items-center justify-between px-4 sm:px-6 text-xs text-slate-500 gap-4">
              <p>&copy; 2026 PredictX Inc. Built securely on Polygon.</p>
              <div className="flex gap-4">
                <Link href="#" className="hover:underline">Terms</Link>
                <Link href="#" className="hover:underline">Privacy</Link>
                <Link href="#" className="hover:underline">Documentation</Link>
              </div>
            </div>
          </footer>
        </Web3Provider>
      </body>
    </html>
  );
}
