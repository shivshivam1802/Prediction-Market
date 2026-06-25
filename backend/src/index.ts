import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { router } from "./routes/api";
import { indexer } from "./services/indexer";
import { prisma } from "./config/db";

// Load environment variables
dotenv.config();

const app = express();
const port = process.env.PORT || 4000;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use("/api", router);

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date() });
});

// Start server and blockchain indexer
app.listen(port, async () => {
  console.log(`Server is running on port ${port}`);
  console.log("process.cwd():", process.cwd());
  try {
    const testMarkets = await prisma.market.findMany();
    console.log("Boot diagnostics - Market entries count in DB:", testMarkets.length);
  } catch (e: any) {
    console.error("Boot diagnostics - Prisma query failed:", e.message);
  }
  
  // Start Ethers.js blockchain indexer
  try {
    await indexer.start();
  } catch (error) {
    console.error("Failed to start event indexer:", error);
  }
});
