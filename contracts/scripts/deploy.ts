import { ethers } from "hardhat";

async function main() {
  const [deployer, user1, user2] = await ethers.getSigners();

  console.log("Deploying contracts with the account:", deployer.address);

  // 1. Deploy MockUSDC
  const MockUSDC = await ethers.getContractFactory("MockUSDC");
  const usdc = await MockUSDC.deploy();
  await usdc.waitForDeployment();
  const usdcAddress = await usdc.getAddress();
  console.log("MockUSDC deployed to:", usdcAddress);

  // 2. Deploy PredictionMarketManager
  const PredictionMarketManager = await ethers.getContractFactory("PredictionMarketManager");
  const manager = await PredictionMarketManager.deploy(usdcAddress);
  await manager.waitForDeployment();
  const managerAddress = await manager.getAddress();
  console.log("PredictionMarketManager deployed to:", managerAddress);

  // 3. Faucet mints to local development wallets
  const decimals = 6;
  const mintAmount = ethers.parseUnits("100000", decimals); // 100k USDC
  await usdc.mint(deployer.address, mintAmount);
  await usdc.mint(user1.address, mintAmount);
  await usdc.mint(user2.address, mintAmount);
  console.log("Minted 100,000 USDC to deployer, user1, and user2");

  // 4. Set up allowances and add initial liquidity to seed markets
  await usdc.approve(managerAddress, ethers.MaxUint256);
  await usdc.connect(user1).approve(managerAddress, ethers.MaxUint256);
  await usdc.connect(user2).approve(managerAddress, ethers.MaxUint256);

  const oneDay = 24 * 60 * 60;
  const now = Math.floor(Date.now() / 1000);

  const seedMarkets = [
    {
      title: "Will Bitcoin exceed $100,000 by the end of 2026?",
      description: "Resolves to YES if Bitcoin (BTC) is trading above $100,000 USD on December 31, 2026, according to CoinGecko's historical data.",
      category: "Crypto",
      duration: 180 * oneDay,
      oracleUrl: "https://api.coingecko.com/v3/coins/bitcoin",
      liqAmount: "20000"
    },
    {
      title: "Will SpaceX land humans on Mars by the end of 2028?",
      description: "Resolves to YES if SpaceX successfully lands a crewed spacecraft on Mars before January 1, 2029, as verified by official NASA/SpaceX reports.",
      category: "Technology",
      duration: 365 * oneDay,
      oracleUrl: "https://www.spacex.com",
      liqAmount: "15000"
    },
    {
      title: "Will the Fed cut interest rates in the next FOMC meeting?",
      description: "Resolves to YES if the Federal Reserve announces a cut in the federal funds rate at the next scheduled FOMC press release.",
      category: "Politics",
      duration: 30 * oneDay,
      oracleUrl: "https://www.federalreserve.gov",
      liqAmount: "10000"
    },
    {
      title: "Will Liverpool win the English Premier League this season?",
      description: "Resolves to YES if Liverpool F.C. finishes 1st in the English Premier League table for the 2025/2026 season.",
      category: "Sports",
      duration: 90 * oneDay,
      oracleUrl: "https://www.premierleague.com",
      liqAmount: "5000"
    }
  ];

  for (const m of seedMarkets) {
    const expTime = now + m.duration;
    
    // Create Market
    const tx = await manager.createMarket(
      m.title,
      m.description,
      m.category,
      expTime,
      m.oracleUrl
    );
    const receipt = await tx.wait();
    
    // In ethers v6, we get the marketCount or parsing logs
    const marketCount = await manager.marketCount();
    console.log(`Created Market #${marketCount}: "${m.title}"`);

    // Add Liquidity
    const liqWei = ethers.parseUnits(m.liqAmount, decimals);
    await manager.addLiquidity(marketCount, liqWei);
    console.log(`Added ${m.liqAmount} USDC of initial liquidity to Market #${marketCount}`);
  }

  console.log("Contracts deployment and seeding complete.");

  // Save deployed addresses to JSON file for backend and frontend consumption
  const fs = require("fs");
  const path = require("path");
  const dir = path.join(__dirname, "../deployments");
  if (!fs.existsSync(dir)){
      fs.mkdirSync(dir);
  }
  fs.writeFileSync(
    path.join(dir, "localhost.json"),
    JSON.stringify({ MockUSDC: usdcAddress, PredictionMarketManager: managerAddress }, null, 2)
  );
  console.log("Saved deployed addresses to deployments/localhost.json");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
