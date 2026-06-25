import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";

describe("PredictionMarketManager", function () {
  async function deployContractsFixture() {
    const [owner, user1, user2] = await ethers.getSigners();

    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    const usdc = await MockUSDC.deploy();
    await usdc.waitForDeployment();
    const usdcAddress = await usdc.getAddress();

    const PredictionMarketManager = await ethers.getContractFactory("PredictionMarketManager");
    const manager = await PredictionMarketManager.deploy(usdcAddress);
    await manager.waitForDeployment();
    const managerAddress = await manager.getAddress();

    // Mint USDC to user1 and user2
    const decimals = 6;
    const initialBalance = ethers.parseUnits("10000", decimals); // 10,000 USDC
    await usdc.mint(user1.address, initialBalance);
    await usdc.mint(user2.address, initialBalance);

    // Approve the manager contract to spend USDC
    await usdc.connect(owner).approve(managerAddress, ethers.MaxUint256);
    await usdc.connect(user1).approve(managerAddress, ethers.MaxUint256);
    await usdc.connect(user2).approve(managerAddress, ethers.MaxUint256);

    return { manager, usdc, owner, user1, user2, decimals };
  }

  describe("Market Management & Initial Setup", function () {
    it("Should deploy with correct collateral token address", async function () {
      const { manager, usdc } = await loadFixture(deployContractsFixture);
      expect(await manager.collateralToken()).to.equal(await usdc.getAddress());
    });

    it("Should allow creation of markets", async function () {
      const { manager, owner } = await loadFixture(deployContractsFixture);
      const expiration = Math.floor(Date.now() / 1000) + 3600; // 1 hour later
      
      await expect(
        manager.createMarket(
          "Will BTC hit $100k?",
          "Resolves to YES if BTC is >= 100k",
          "Crypto",
          expiration,
          "https://api.coingecko.com"
        )
      )
        .to.emit(manager, "MarketCreated")
        .withArgs(1, "Will BTC hit $100k?", "Resolves to YES if BTC is >= 100k", "Crypto", expiration, "https://api.coingecko.com", owner.address);

      const market = await manager.markets(1);
      expect(market.title).to.equal("Will BTC hit $100k?");
      expect(market.resolved).to.be.false;
    });

    it("Should reject markets with past expiration", async function () {
      const { manager } = await loadFixture(deployContractsFixture);
      const expiration = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
      await expect(
        manager.createMarket("Title", "Desc", "Cat", expiration, "url")
      ).to.be.revertedWith("Expiration must be in the future");
    });
  });

  describe("Liquidity Provision", function () {
    it("Should allow initial liquidity provision and mint correct LP", async function () {
      const { manager, usdc, user1, decimals } = await loadFixture(deployContractsFixture);
      const expiration = Math.floor(Date.now() / 1000) + 3600;
      await manager.createMarket("Title", "Desc", "Cat", expiration, "url");

      const liqAmount = ethers.parseUnits("1000", decimals); // 1,000 USDC
      await expect(manager.connect(user1).addLiquidity(1, liqAmount))
        .to.emit(manager, "LiquidityAdded")
        .withArgs(1, user1.address, liqAmount, liqAmount);

      const market = await manager.markets(1);
      expect(market.yesSharesPool).to.equal(liqAmount);
      expect(market.noSharesPool).to.equal(liqAmount);
      expect(market.lpTokenTotalSupply).to.equal(liqAmount);
      expect(await manager.lpBalances(1, user1.address)).to.equal(liqAmount);
    });

    it("Should allow subsequent liquidity provision and calculate LP correctly", async function () {
      const { manager, user1, user2, decimals } = await loadFixture(deployContractsFixture);
      const expiration = Math.floor(Date.now() / 1000) + 3600;
      await manager.createMarket("Title", "Desc", "Cat", expiration, "url");

      // User 1 adds 1,000 USDC
      const liq1 = ethers.parseUnits("1000", decimals);
      await manager.connect(user1).addLiquidity(1, liq1);

      // User 2 adds 500 USDC
      const liq2 = ethers.parseUnits("500", decimals);
      await manager.connect(user2).addLiquidity(1, liq2);

      const market = await manager.markets(1);
      // Since pool was 50-50, user2 gets exactly 500 LP tokens
      expect(market.lpTokenTotalSupply).to.equal(liq1 + liq2);
      expect(await manager.lpBalances(1, user2.address)).to.equal(liq2);
    });
  });

  describe("Trading (YES/NO Shares)", function () {
    it("Should buy YES shares and update pools under CPMM", async function () {
      const { manager, user1, user2, decimals } = await loadFixture(deployContractsFixture);
      const expiration = Math.floor(Date.now() / 1000) + 3600;
      await manager.createMarket("Title", "Desc", "Cat", expiration, "url");

      // 1. Add 1000 USDC liquidity (y = 1000, n = 1000, fee = 1%)
      const liq = ethers.parseUnits("1000", decimals);
      await manager.connect(user1).addLiquidity(1, liq);

      // 2. User 2 buys YES with 100 USDC
      const buyAmount = ethers.parseUnits("100", decimals);
      const fee = buyAmount / 100n; // 1% fee = 1 USDC
      const tradeAmount = buyAmount - fee; // 99 USDC

      // Expected shares = tradeAmount * (1 + y / (n + tradeAmount))
      // y = 1000, n = 1000, trade = 99
      // shares = 99 * (1 + 1000 / 1099) = 99 * (2099 / 1099) = 189.09 USDC equivalent
      const expectedShares = tradeAmount + (tradeAmount * liq) / (liq + tradeAmount);

      await expect(manager.connect(user2).buyYes(1, buyAmount, 0))
        .to.emit(manager, "SharesTraded")
        .withArgs(1, user2.address, true, true, buyAmount, expectedShares);

      expect(await manager.yesShares(1, user2.address)).to.equal(expectedShares);
    });

    it("Should allow selling YES shares and return correct collateral", async function () {
      const { manager, user1, user2, decimals } = await loadFixture(deployContractsFixture);
      const expiration = Math.floor(Date.now() / 1000) + 3600;
      await manager.createMarket("Title", "Desc", "Cat", expiration, "url");

      // LP provides 1000 USDC
      const liq = ethers.parseUnits("1000", decimals);
      await manager.connect(user1).addLiquidity(1, liq);

      // User 2 buys YES with 100 USDC
      const buyAmount = ethers.parseUnits("100", decimals);
      await manager.connect(user2).buyYes(1, buyAmount, 0);

      // User 2 sells all their YES shares
      const userShares = await manager.yesShares(1, user2.address);
      const balanceBefore = await ethers.provider.getBalance(user2.address); // ETH balance
      
      const usdcBalanceBefore = await manager.collateralToken();
      const usdcContract = await ethers.getContractAt("MockUSDC", usdcBalanceBefore);
      const tokenBalanceBefore = await usdcContract.balanceOf(user2.address);

      await manager.connect(user2).sellYes(1, userShares, 0);

      const tokenBalanceAfter = await usdcContract.balanceOf(user2.address);
      
      // Net collateral returned should be close to 100 USDC minus fees
      expect(tokenBalanceAfter).to.be.greaterThan(tokenBalanceBefore);
      expect(await manager.yesShares(1, user2.address)).to.equal(0);
    });
  });

  describe("Resolution & Claims", function () {
    it("Should claim payouts correctly for winners", async function () {
      const { manager, usdc, owner, user1, user2, decimals } = await loadFixture(deployContractsFixture);
      const expiration = Math.floor(Date.now() / 1000) + 3600;
      await manager.createMarket("Title", "Desc", "Cat", expiration, "url");

      // Add liquidity
      await manager.connect(user1).addLiquidity(1, ethers.parseUnits("1000", decimals));

      // User 2 buys YES with 100 USDC
      await manager.connect(user2).buyYes(1, ethers.parseUnits("100", decimals), 0);
      const user2YesShares = await manager.yesShares(1, user2.address);

      // Resolve market to YES (outcome = 1)
      await manager.resolveMarket(1, 1);

      // User 2 claims winnings
      const balanceBefore = await usdc.balanceOf(user2.address);
      await manager.connect(user2).claimWinnings(1);
      const balanceAfter = await usdc.balanceOf(user2.address);

      // Since YES won, user 2 receives 1 collateral per share
      expect(balanceAfter - balanceBefore).to.equal(user2YesShares);
    });
  });
});
