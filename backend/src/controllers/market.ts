import { Request, Response } from "express";
import { prisma } from "../config/db";

export const getAllMarkets = async (req: Request, res: Response) => {
  try {
    const { category, search, resolved } = req.query;

    const whereClause: any = {};

    if (category) {
      whereClause.category = category as string;
    }

    if (resolved) {
      whereClause.resolved = resolved === "true";
    }

    if (search) {
      whereClause.OR = [
        { title: { contains: search as string, mode: "insensitive" } },
        { description: { contains: search as string, mode: "insensitive" } }
      ];
    }

    console.log("Controller Debug - whereClause:", whereClause);
    const dbMarkets = await prisma.market.findMany({ where: whereClause });
    console.log("Controller Debug - findMany returned count:", dbMarkets.length);

    const markets = await marketsWithPrices(whereClause);
    res.json(markets);
  } catch (error: any) {
    console.error("Controller Debug - Query error:", error.message);
    res.status(500).json({ error: error.message });
  }
};

export const getMarketById = async (req: Request, res: Response) => {
  try {
    const marketId = parseInt(req.params.id);
    if (isNaN(marketId)) {
      return res.status(400).json({ error: "Invalid market ID" });
    }

    const market = await prisma.market.findUnique({
      where: { id: marketId },
      include: {
        priceHistory: {
          orderBy: { timestamp: "asc" },
          take: 100 // Last 100 points
        },
        trades: {
          orderBy: { timestamp: "desc" },
          take: 50,
          include: {
            user: {
              select: { username: true, wallet: true }
            }
          }
        },
        comments: {
          orderBy: { timestamp: "desc" },
          include: {
            user: {
              select: { username: true, wallet: true }
            }
          }
        }
      }
    });

    if (!market) {
      return res.status(404).json({ error: "Market not found" });
    }

    // Attach current price
    const yesPool = parseFloat(market.yesSharesPool) / 1e6;
    const noPool = parseFloat(market.noSharesPool) / 1e6;
    const totalPool = yesPool + noPool;
    const yesPrice = totalPool > 0 ? noPool / totalPool : 0.5;
    const noPrice = totalPool > 0 ? yesPool / totalPool : 0.5;

    res.json({
      ...market,
      yesPrice,
      noPrice
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const addComment = async (req: Request, res: Response) => {
  try {
    const marketId = parseInt(req.params.id);
    const { userWallet, content } = req.body;

    if (isNaN(marketId) || !userWallet || !content) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Check market exists
    const market = await prisma.market.findUnique({ where: { id: marketId } });
    if (!market) {
      return res.status(404).json({ error: "Market not found" });
    }

    // Ensure user exists
    await prisma.user.upsert({
      where: { wallet: userWallet },
      create: { wallet: userWallet },
      update: {}
    });

    const comment = await prisma.comment.create({
      data: {
        marketId,
        userWallet,
        content
      },
      include: {
        user: {
          select: { username: true, wallet: true }
        }
      }
    });

    res.status(201).json(comment);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

// Helper to fetch markets and append current prices based on pool sizes
async function marketsWithPrices(whereClause: any) {
  const markets = await prisma.market.findMany({
    where: whereClause,
    orderBy: { createdAt: "desc" }
  });

  return markets.map((market) => {
    const yesPool = parseFloat(market.yesSharesPool) / 1e6;
    const noPool = parseFloat(market.noSharesPool) / 1e6;
    const totalPool = yesPool + noPool;
    const yesPrice = totalPool > 0 ? noPool / totalPool : 0.5;
    const noPrice = totalPool > 0 ? yesPool / totalPool : 0.5;

    return {
      ...market,
      yesPrice,
      noPrice
    };
  });
}
