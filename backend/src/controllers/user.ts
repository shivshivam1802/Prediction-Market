import { Request, Response } from "express";
import { prisma } from "../config/db";
import { ethers } from "ethers";

export const getUserProfile = async (req: Request, res: Response) => {
  try {
    const { wallet } = req.params;
    if (!wallet) {
      return res.status(400).json({ error: "Wallet address is required" });
    }

    const user = await prisma.user.findUnique({
      where: { wallet },
      include: {
        _count: {
          select: { trades: true }
        }
      }
    });

    if (!user) {
      // Auto-register user on first fetch
      const newUser = await prisma.user.create({
        data: { wallet },
        include: {
          _count: {
            select: { trades: true }
          }
        }
      });
      return res.json(newUser);
    }

    res.json(user);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const updateUserProfile = async (req: Request, res: Response) => {
  try {
    const { wallet } = req.params;
    const { username } = req.body;

    if (!wallet) {
      return res.status(400).json({ error: "Wallet address is required" });
    }

    const updatedUser = await prisma.user.update({
      where: { wallet },
      data: { username }
    });

    res.json(updatedUser);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const getLeaderboard = async (req: Request, res: Response) => {
  try {
    // Rank users based on total trading volume
    const users = await prisma.user.findMany({
      include: {
        trades: {
          select: {
            collateralAmount: true
          }
        }
      }
    });

    const leaderboard = users.map((user) => {
      const totalVolume = user.trades.reduce((sum, trade) => {
        const amt = parseFloat(ethers.formatUnits(trade.collateralAmount, 6));
        return sum + amt;
      }, 0);

      return {
        wallet: user.wallet,
        username: user.username,
        reputation: user.reputation,
        tradeCount: user.trades.length,
        totalVolume
      };
    });

    // Sort descending by volume
    leaderboard.sort((a, b) => b.totalVolume - a.totalVolume);

    res.json(leaderboard.slice(0, 20)); // Return top 20 users
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};
