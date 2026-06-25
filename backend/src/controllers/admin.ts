import { Request, Response } from "express";
import { prisma } from "../config/db";
import { ethers } from "ethers";

export const getPlatformStats = async (req: Request, res: Response) => {
  try {
    const [marketsCount, usersCount, markets] = await Promise.all([
      prisma.market.count(),
      prisma.user.count(),
      prisma.market.findMany({
        select: {
          volume: true,
          openInterest: true
        }
      })
    ]);

    let totalVolume = 0;
    let totalOpenInterest = 0;

    for (const m of markets) {
      totalVolume += parseFloat(ethers.formatUnits(m.volume, 6));
      totalOpenInterest += parseFloat(ethers.formatUnits(m.openInterest, 6));
    }

    res.json({
      marketsCount,
      usersCount,
      totalVolume,
      totalOpenInterest
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};
