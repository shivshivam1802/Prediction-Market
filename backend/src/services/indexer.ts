import { ethers } from "ethers";
import { prisma } from "../config/db";
import { contract, provider } from "../config/web3";

export class Indexer {
  private provider = provider;
  private contract = contract;
  private isRunning: boolean = false;
  private startBlock: number = 0;

  constructor() {
    // Shared provider and contract imported from config/web3
  }


  public async start() {
    if (!process.env.CONTRACT_ADDRESS || this.isRunning) return;
    this.isRunning = true;
    console.log("Starting Indexer... Connected to contract:", process.env.CONTRACT_ADDRESS);

    try {
      // 1. Catch up on historical blocks
      await this.syncLogs();

      // 2. Start listening to live events
      this.listenLiveEvents();
    } catch (error) {
      console.error("Error in Indexer start:", error);
      this.isRunning = false;
    }
  }

  private async syncLogs() {
    const currentBlock = await this.provider.getBlockNumber();
    console.log(`Current blockchain block: ${currentBlock}. Starting historical sync...`);

    // In a production setup, we would read the last synced block from a DB setting.
    // For simplicity, we sync from block 0 (or a deploy block) to the current block.
    const filter = {
      address: await this.contract.getAddress(),
      fromBlock: this.startBlock,
      toBlock: currentBlock
    };

    // Fetch and process past events in order
    const events = await this.contract.queryFilter("*", this.startBlock, currentBlock);
    console.log(`Found ${events.length} historical events to process.`);
    
    for (const event of events) {
      await this.processEvent(event);
    }

    this.startBlock = currentBlock + 1;
    console.log("Historical sync complete.");
  }

  private listenLiveEvents() {
    console.log("Listening to live events...");

    this.contract.on("*", async (event) => {
      try {
        await this.processEvent(event);
      } catch (err) {
        console.error("Error processing live event:", err);
      }
    });
  }

  private async processEvent(log: any) {
    const rawLog = log.log || log;
    const eventName = log.fragment ? log.fragment.name : log.name;
    const args = log.args || rawLog.args;

    if (!eventName || !args) return;

    const txHash = rawLog.transactionHash;
    const block = await this.provider.getBlock(rawLog.blockNumber);
    const timestamp = block ? new Date(block.timestamp * 1000) : new Date();

    console.log(`Processing Event: ${eventName} (Tx: ${txHash})`);

    switch (eventName) {
      case "MarketCreated": {
        const { marketId, title, description, category, expirationTimestamp, oracleUrl, creator } = args;
        
        await prisma.market.upsert({
          where: { id: Number(marketId) },
          create: {
            id: Number(marketId),
            title,
            description,
            category,
            expirationTimestamp: new Date(Number(expirationTimestamp) * 1000),
            oracleUrl,
            creator,
            yesSharesPool: "0",
            noSharesPool: "0",
            lpTokenTotalSupply: "0",
            volume: "0",
            openInterest: "0"
          },
          update: {
            title,
            description,
            category,
            expirationTimestamp: new Date(Number(expirationTimestamp) * 1000),
            oracleUrl,
            creator
          }
        });
        console.log(`Synced Created Market #${marketId}`);
        break;
      }

      case "SharesTraded": {
        const { marketId, user, isYes, isBuy, collateralAmount, sharesAmount } = args;
        const mId = Number(marketId);

        // Ensure user exists
        await prisma.user.upsert({
          where: { wallet: user },
          create: { wallet: user },
          update: {}
        });

        // Get tx index for unique trade id
        const tradeId = `${txHash}-${rawLog.index}`;

        // Compute price per share
        const shares = parseFloat(ethers.formatUnits(sharesAmount, 6));
        const collateral = parseFloat(ethers.formatUnits(collateralAmount, 6));
        const price = shares > 0 ? collateral / shares : 0.5;

        // Create trade record
        await prisma.trade.upsert({
          where: { id: tradeId },
          create: {
            id: tradeId,
            txHash,
            userWallet: user,
            marketId: mId,
            isYes,
            isBuy,
            collateralAmount: collateralAmount.toString(),
            sharesAmount: sharesAmount.toString(),
            price,
            timestamp
          },
          update: {}
        });

        // Update on-chain states for market
        await this.syncMarketState(mId, collateralAmount.toString(), isBuy);
        break;
      }

      case "LiquidityAdded": {
        const { marketId, provider, collateralAmount, lpShares } = args;
        const mId = Number(marketId);

        // Ensure user exists
        await prisma.user.upsert({
          where: { wallet: provider },
          create: { wallet: provider },
          update: {}
        });

        const liqId = `${txHash}-${rawLog.index}`;
        await prisma.liquidity.upsert({
          where: { id: liqId },
          create: {
            id: liqId,
            txHash,
            providerWallet: provider,
            marketId: mId,
            type: "ADD",
            collateralAmount: collateralAmount.toString(),
            lpShares: lpShares.toString(),
            timestamp
          },
          update: {}
        });

        await this.syncMarketState(mId, "0", false);
        break;
      }

      case "LiquidityRemoved": {
        const { marketId, provider, collateralAmount, lpShares } = args;
        const mId = Number(marketId);

        // Ensure user exists
        await prisma.user.upsert({
          where: { wallet: provider },
          create: { wallet: provider },
          update: {}
        });

        const liqId = `${txHash}-${rawLog.index}`;
        await prisma.liquidity.upsert({
          where: { id: liqId },
          create: {
            id: liqId,
            txHash,
            providerWallet: provider,
            marketId: mId,
            type: "REMOVE",
            collateralAmount: collateralAmount.toString(),
            lpShares: lpShares.toString(),
            timestamp
          },
          update: {}
        });

        await this.syncMarketState(mId, "0", false);
        break;
      }

      case "MarketResolved": {
        const { marketId, outcome } = args;
        const mId = Number(marketId);

        await prisma.market.update({
          where: { id: mId },
          data: {
            resolved: true,
            outcome: Number(outcome)
          }
        });
        console.log(`Synced Resolution of Market #${mId} to ${outcome}`);
        break;
      }
    }
  }

  private async syncMarketState(marketId: number, tradeCollateral: string, isBuy: boolean) {
    try {
      // Query contract for latest variables
      const rawMarket = await this.contract.markets(marketId);
      
      const yesPool = rawMarket.yesSharesPool;
      const noPool = rawMarket.noSharesPool;
      const lpSupply = rawMarket.lpTokenTotalSupply;
      const resolved = rawMarket.resolved;
      const outcome = Number(rawMarket.outcome);

      // Compute Prices based on current pool
      const yesPoolNum = parseFloat(ethers.formatUnits(yesPool, 6));
      const noPoolNum = parseFloat(ethers.formatUnits(noPool, 6));
      const totalPool = yesPoolNum + noPoolNum;

      let yesPrice = 0.50;
      let noPrice = 0.50;

      if (totalPool > 0) {
        // Price represents likelihood (ratio of opposite pool size)
        yesPrice = noPoolNum / totalPool;
        noPrice = yesPoolNum / totalPool;
      }

      // Calculate total volume increase if trade
      const volumeIncrement = isBuy ? BigInt(tradeCollateral) : BigInt(0);

      // Fetch existing market to add volume
      const currentMarket = await prisma.market.findUnique({
        where: { id: marketId }
      });

      const oldVolume = currentMarket ? BigInt(currentMarket.volume) : BigInt(0);
      const newVolume = (oldVolume + volumeIncrement).toString();

      // Open interest is equivalent to the pool's remaining backing collateral.
      // In the manager contract, total collateral deposited into the market pool is equal to the max pool size,
      // or simply the number of YES/NO outstanding.
      // Let's use max(yesSharesPool, noSharesPool) or simply yesSharesPool + outstanding shares.
      // An easy, robust estimate for current open interest (pool backing) is the sum of pool collateral.
      // Since YES & NO pool balances are backed 1-to-1, and users hold some YES or NO shares,
      // the actual collateral backing the pool is simply the contract collateral balance for this market.
      // Let's estimate open interest as the total YES pool size, which is exactly the collateral in LP pool.
      const openInterest = yesPool.toString();

      await prisma.market.update({
        where: { id: marketId },
        data: {
          yesSharesPool: yesPool.toString(),
          noSharesPool: noPool.toString(),
          lpTokenTotalSupply: lpSupply.toString(),
          resolved,
          outcome,
          volume: newVolume,
          openInterest
        }
      });

      // Save to price history
      await prisma.marketPriceHistory.create({
        data: {
          marketId,
          yesPrice,
          noPrice
        }
      });

      console.log(`Synced state for Market #${marketId}: YES=${yesPrice.toFixed(2)}, NO=${noPrice.toFixed(2)}`);
    } catch (error) {
      console.error(`Failed to sync market state for market #${marketId}:`, error);
    }
  }
}
export const indexer = new Indexer();
