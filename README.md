# PredictX - Decentralized Prediction Market Platform

PredictX is a production-ready, highly optimized decentralized prediction market platform similar to Polymarket. It allows users to trade YES/NO shares on real-world events (Crypto, Tech, Politics, Sports) using a custom Constant Product Market Maker (CPMM) model.

---

## 🛠️ Technical Architecture

PredictX is structured as a monorepo consisting of:

```
├── contracts/        # Hardhat Solidity environment
│   ├── contracts/    # PredictionMarketManager.sol & MockUSDC.sol
│   ├── test/         # Comprehensive contract unit tests
│   └── scripts/      # Deploy and seed script
├── backend/          # Node.js, Express, TypeScript & Prisma ORM
│   ├── src/services/ # Real-time Ethers.js blockchain event indexer
│   └── src/routes/   # REST APIs for market states, histories, comments
├── frontend/         # Next.js 15, TypeScript, Tailwind CSS
│   ├── src/context/  # Wagmi & RainbowKit Web3 provider context
│   └── src/app/      # Dashboards, portfolios, charts (Recharts)
└── docker-compose.yml# Orchestrator for Postgres, Hardhat, API, & Next.js
```

---

## 📐 CPMM & LP Mathematical Design

In a prediction market, YES and NO shares are complementary assets. A single pair of YES and NO shares is backed 1-to-1 by a collateral token (e.g. USDC). That is:
$$\text{1 YES Share} + \text{1 NO Share} = \text{1 USDC}$$

### 1. The Swap Math (Constant Product)
The AMM pool holds $y$ YES shares and $n$ NO shares. The product is kept constant:
$$y \cdot n = k$$

When a user buys YES shares with $c$ collateral:
1. The contract mints $c$ YES and $c$ NO shares.
2. The $c$ NO shares are added to the pool ($n' = n + c$).
3. The pool releases a portion of YES shares to the user ($y'$ remaining in the pool).
4. To maintain $y' \cdot n' = k$:
   $$y' = \frac{y \cdot n}{n + c}$$
5. The user receives their minted $c$ YES shares plus the released shares:
   $$\Delta y = c + (y - y') = c \left( 1 + \frac{y}{n + c} \right)$$

This is implemented on-chain using 100% precise Solidity division.

### 2. The Liquidity Provision (LP) Math
To incentivize market making, users can add liquidity:
- An LP deposits $c$ collateral.
- The contract mints $c$ YES and $c$ NO shares and adds both to the pool.
- The LP receives LP tokens proportional to the growth of the pool's geometric mean:
  $$\Delta S = S \left( \sqrt{\frac{(y+c)(n+c)}{y \cdot n}} - 1 \right)$$
- When removing liquidity, the contract merges overlapping YES and NO shares back into direct USDC collateral, returning any single-sided surplus shares directly to the LP's wallet.

---

## 🚀 Running the Platform (Docker Setup)

The entire environment is configured to run automatically in containers. You do not need to install local PostgreSQL or global Node instances.

### Prerequisites
- Docker & Docker Compose installed.
- A Web3 wallet (MetaMask recommended).

### Commands
1. **Start all services**:
   ```bash
   docker-compose up --build
   ```
   This will spin up:
   - **PostgreSQL Database** (`port 5432`)
   - **Hardhat Blockchain Node** (`port 8545`) & deploy/seed contracts
   - **Express API & Event Indexer** (`port 4000`)
   - **Next.js 15 Web Application** (`port 3000`)

2. **Access the application**:
   - Web App: [http://localhost:3000](http://localhost:3000)
   - API Health check: [http://localhost:4000/health](http://localhost:4000/health)

---

## 🦊 Setting up MetaMask (Local Testnet)

To interact with the local blockchain node inside Docker:

1. Open MetaMask and add a **Custom Network**:
   - **Network Name**: Hardhat Local
   - **New RPC URL**: `http://127.0.0.1:8545`
   - **Chain ID**: `31337`
   - **Currency Symbol**: `ETH`

2. **Import test wallets**:
   Hardhat starts with 20 pre-funded accounts holding 10,000 test ETH. You can import them using their private keys:
   - **Admin/Owner Wallet** (Account 0):
     - Private Key: `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80`
   - **User Wallet 1** (Account 1):
     - Private Key: `0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d`

3. **Mint Mock USDC Collateral**:
   Connect your wallet on [http://localhost:3000](http://localhost:3000) and click the **"Claim Faucet"** button in the header. This calls the `mint` method on the `MockUSDC` token contract, giving your wallet 1,000 mock USDC to trade with.
