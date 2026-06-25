import { Request, Response } from "express";
import { prisma } from "../config/db";
import { contract } from "../config/web3";
import { ethers } from "ethers";

export const getTradeHistory = async (req: Request, res: Response) => {
  try {
    const { marketId, userWallet } = req.query;
    const whereClause: any = {};

    if (marketId) {
      whereClause.marketId = parseInt(marketId as string);
    }
    if (userWallet) {
      whereClause.userWallet = userWallet as string;
    }

    const trades = await prisma.trade.findMany({
      where: whereClause,
      orderBy: { timestamp: "desc" },
      include: {
        market: {
          select: { title: true }
        }
      }
    });

    res.json(trades);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const getUserPortfolio = async (req: Request, res: Response) => {
  try {
    const { wallet } = req.params;
    if (!wallet) {
      return res.status(400).json({ error: "Wallet address is required" });
    }

    // 1. Get all unique market IDs where user has interacted (trades or liquidity)
    const [trades, liquidities] = await Promise.all([
      prisma.trade.findMany({
        where: { userWallet: wallet },
        select: { marketId: true },
        distinct: ["marketId"]
      }),
      prisma.liquidity.findMany({
        where: { providerWallet: wallet },
        select: { marketId: true },
        distinct: ["marketId"]
      })
    ]);

    const marketIds = Array.from(
      new Set([
        ...trades.map((t) => t.marketId),
        ...liquidities.map((l) => l.marketId)
      ])
    );

    const positions: any[] = [];
    let totalPortfolioValue = 0;
    let totalInvested = 0;
    let totalLpValue = 0;

    for (const mId of marketIds) {
      // Get market from DB
      const market = await prisma.market.findUnique({
        where: { id: mId }
      });
      if (!market) continue;

      // On-chain fetch of current share balances & LP balances
      const [yesRaw, noRaw, lpRaw] = await Promise.all([
        contract.yesShares(mId, wallet),
        contract.noShares(mId, wallet),
        contract.lpBalances(mId, wallet)
      ]);

      const yesShares = parseFloat(ethers.formatUnits(yesRaw, 6));
      const noShares = parseFloat(ethers.formatUnits(noRaw, 6));
      const lpBalance = parseFloat(ethers.formatUnits(lpRaw, 6));

      if (yesShares === 0 && noShares === 0 && lpBalance === 0) {
        continue; // User has no remaining positions in this market
      }

      // Calculate current prices
      const yesPool = parseFloat(market.yesSharesPool) / 1e6;
      const noPool = parseFloat(market.noSharesPool) / 1e6;
      const totalPool = yesPool + noPool;
      let yesPrice = totalPool > 0 ? noPool / totalPool : 0.5;
      let noPrice = totalPool > 0 ? yesPool / totalPool : 0.5;

      // Determine share values based on resolution status
      let yesValuation = yesShares * yesPrice;
      let noValuation = noShares * noPrice;

      if (market.resolved) {
        if (market.outcome === 1) {
          yesValuation = yesShares * 1.0;
          noValuation = 0.0;
          yesPrice = 1.0;
          noPrice = 0.0;
        } else if (market.outcome === 2) {
          yesValuation = 0.0;
          noValuation = noShares * 1.0;
          yesPrice = 0.0;
          noPrice = 1.0;
        } else if (market.outcome === 3) {
          yesValuation = yesShares * 0.5;
          noValuation = noShares * 0.5;
          yesPrice = 0.5;
          noPrice = 0.5;
        }
      }

      const totalShareValue = yesValuation + noValuation;

      // Calculate investment amount (net capital spent on buys vs sells in this market)
      const userTrades = await prisma.trade.findMany({
        where: { userWallet: wallet, marketId: mId }
      });

      let netInvested = 0;
      for (const t of userTrades) {
        const amt = parseFloat(ethers.formatUnits(t.collateralAmount, 6));
        if (t.isBuy) {
          netInvested += amt;
        } else {
          netInvested -= amt;
        }
      }

      // If netInvested is negative (meaning user took out more profits than they spent), cap at 0
      const positionInvested = netInvested < 0 ? 0 : netInvested;

      // LP Valuation
      let lpValue = 0;
      const totalLpSupply = parseFloat(market.lpTokenTotalSupply) / 1e6;
      if (lpBalance > 0 && totalLpSupply > 0) {
        if (market.resolved) {
          if (market.outcome === 1) {
            lpValue = (yesPool * lpBalance) / totalLpSupply;
          } else if (market.outcome === 2) {
            lpValue = (noPool * lpBalance) / totalLpSupply;
          } else if (market.outcome === 3) {
            lpValue = ((yesPool + noPool) * lpBalance) / (2 * totalLpSupply);
          }
        } else {
          // LP value before resolution is equal to the user's fraction of YES/NO pools
          // Since LP adds 1:1 YES/NO, each pool share is priced at current market price
          const userYesFractionValue = (yesPool * lpBalance / totalLpSupply) * yesPrice;
          const userNoFractionValue = (noPool * lpBalance / totalLpSupply) * noPrice;
          lpValue = userYesFractionValue + userNoFractionValue;
        }
      }

      const currentValuation = totalShareValue + lpValue;
      const profitLoss = currentValuation - positionInvested;

      positions.push({
        marketId: mId,
        title: market.title,
        resolved: market.resolved,
        outcome: market.outcome,
        yesShares,
        noShares,
        yesPrice,
        noPrice,
        lpBalance,
        lpValue,
        netInvested: positionInvested,
        currentValue: currentValuation,
        pnl: profitLoss,
        pnlPercent: positionInvested > 0 ? (profitLoss / positionInvested) * 100 : 0
      });

      totalPortfolioValue += currentValuation;
      totalInvested += positionInvested;
      totalLpValue += lpValue;
    }

    const netProfitLoss = totalPortfolioValue - totalInvested;
    const totalPnlPercent = totalInvested > 0 ? (netProfitLoss / totalInvested) * 100 : 0;

    res.json({
      summary: {
        portfolioValue: totalPortfolioValue,
        totalInvested,
        lpValue: totalLpValue,
        netPnl: netProfitLoss,
        pnlPercent: totalPnlPercent
      },
      positions
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};
