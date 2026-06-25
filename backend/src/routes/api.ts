import { Router } from "express";
import { getAllMarkets, getMarketById, addComment } from "../controllers/market";
import { getTradeHistory, getUserPortfolio } from "../controllers/trade";
import { getUserProfile, updateUserProfile, getLeaderboard } from "../controllers/user";
import { getPlatformStats } from "../controllers/admin";

const router = Router();

// Market Routes
router.get("/markets", getAllMarkets);
router.get("/markets/:id", getMarketById);
router.post("/markets/:id/comments", addComment);

// Trade Routes
router.get("/trades", getTradeHistory);
router.get("/portfolio/:wallet", getUserPortfolio);

// User Routes
router.get("/users/:wallet", getUserProfile);
router.put("/users/:wallet", updateUserProfile);
router.get("/leaderboard", getLeaderboard);

// Admin Routes
router.get("/admin/stats", getPlatformStats);

export default router;
export { router };
