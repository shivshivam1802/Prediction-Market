// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract PredictionMarketManager is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct Market {
        uint256 id;
        string title;
        string description;
        string category;
        uint256 expirationTimestamp;
        bool resolved;
        uint8 outcome; // 0: Unresolved, 1: YES, 2: NO, 3: Invalid/Cancelled
        uint256 yesSharesPool; // YES shares in AMM pool
        uint256 noSharesPool; // NO shares in AMM pool
        uint256 lpTokenTotalSupply; // Total LP tokens issued for this market
        string oracleUrl;
        address creator;
    }

    IERC20 public immutable collateralToken;
    uint256 public marketCount;
    uint256 public feePercent = 100; // 100 basis points = 1%

    mapping(uint256 => Market) public markets;
    mapping(uint256 => mapping(address => uint256)) public yesShares;
    mapping(uint256 => mapping(address => uint256)) public noShares;
    mapping(uint256 => mapping(address => uint256)) public lpBalances;

    event MarketCreated(
        uint256 indexed marketId,
        string title,
        string description,
        string category,
        uint256 expirationTimestamp,
        string oracleUrl,
        address indexed creator
    );

    event SharesTraded(
        uint256 indexed marketId,
        address indexed user,
        bool isYes,
        bool isBuy,
        uint256 collateralAmount,
        uint256 sharesAmount
    );

    event LiquidityAdded(
        uint256 indexed marketId,
        address indexed provider,
        uint256 collateralAmount,
        uint256 lpShares
    );

    event LiquidityRemoved(
        uint256 indexed marketId,
        address indexed provider,
        uint256 collateralAmount,
        uint256 lpShares,
        uint256 yesSharesReturned,
        uint256 noSharesReturned
    );

    event MarketResolved(uint256 indexed marketId, uint8 outcome);
    event WinningsClaimed(uint256 indexed marketId, address indexed user, uint256 amountClaimed);

    constructor(address _collateralToken) Ownable(msg.sender) {
        require(_collateralToken != address(0), "Invalid collateral token");
        collateralToken = IERC20(_collateralToken);
    }

    function setFeePercent(uint256 _feePercent) external onlyOwner {
        require(_feePercent <= 500, "Fee cannot exceed 5%");
        feePercent = _feePercent;
    }

    function createMarket(
        string calldata title,
        string calldata description,
        string calldata category,
        uint256 expirationTimestamp,
        string calldata oracleUrl
    ) external returns (uint256) {
        require(expirationTimestamp > block.timestamp, "Expiration must be in the future");
        
        marketCount++;
        markets[marketCount] = Market({
            id: marketCount,
            title: title,
            description: description,
            category: category,
            expirationTimestamp: expirationTimestamp,
            resolved: false,
            outcome: 0,
            yesSharesPool: 0,
            noSharesPool: 0,
            lpTokenTotalSupply: 0,
            oracleUrl: oracleUrl,
            creator: msg.sender
        });

        emit MarketCreated(
            marketCount,
            title,
            description,
            category,
            expirationTimestamp,
            oracleUrl,
            msg.sender
        );

        return marketCount;
    }

    function addLiquidity(uint256 marketId, uint256 collateralAmount) external nonReentrant {
        Market storage market = markets[marketId];
        require(!market.resolved, "Market resolved");
        require(block.timestamp < market.expirationTimestamp, "Market expired");
        require(collateralAmount > 0, "Amount must be > 0");

        collateralToken.safeTransferFrom(msg.sender, address(this), collateralAmount);

        uint256 sharesToMint;
        if (market.lpTokenTotalSupply == 0) {
            // First liquidity provider, initialize pool 1:1
            market.yesSharesPool = collateralAmount;
            market.noSharesPool = collateralAmount;
            sharesToMint = collateralAmount;
        } else {
            // Calculate increase in invariant sqrt(y * n)
            uint256 currentK = market.yesSharesPool * market.noSharesPool;
            uint256 currentSqrtK = Math.sqrt(currentK);

            uint256 newYes = market.yesSharesPool + collateralAmount;
            uint256 newNo = market.noSharesPool + collateralAmount;
            uint256 newK = newYes * newNo;
            uint256 newSqrtK = Math.sqrt(newK);

            sharesToMint = (market.lpTokenTotalSupply * (newSqrtK - currentSqrtK)) / currentSqrtK;
            
            market.yesSharesPool = newYes;
            market.noSharesPool = newNo;
        }

        require(sharesToMint > 0, "Zero LP shares minted");

        market.lpTokenTotalSupply += sharesToMint;
        lpBalances[marketId][msg.sender] += sharesToMint;

        emit LiquidityAdded(marketId, msg.sender, collateralAmount, sharesToMint);
    }

    function removeLiquidity(uint256 marketId, uint256 lpAmount) external nonReentrant {
        Market storage market = markets[marketId];
        require(lpAmount > 0, "LP amount must be > 0");
        require(lpBalances[marketId][msg.sender] >= lpAmount, "Insufficient LP balance");

        uint256 totalLP = market.lpTokenTotalSupply;
        uint256 yesReturned = (market.yesSharesPool * lpAmount) / totalLP;
        uint256 noReturned = (market.noSharesPool * lpAmount) / totalLP;

        market.yesSharesPool -= yesReturned;
        market.noSharesPool -= noReturned;
        market.lpTokenTotalSupply -= lpAmount;
        lpBalances[marketId][msg.sender] -= lpAmount;

        // Merge overlapping shares to return direct collateral
        uint256 collateralToReturn = Math.min(yesReturned, noReturned);
        uint256 extraYes = yesReturned - collateralToReturn;
        uint256 extraNo = noReturned - collateralToReturn;

        if (extraYes > 0) {
            yesShares[marketId][msg.sender] += extraYes;
        }
        if (extraNo > 0) {
            noShares[marketId][msg.sender] += extraNo;
        }

        if (collateralToReturn > 0) {
            collateralToken.safeTransfer(msg.sender, collateralToReturn);
        }

        emit LiquidityRemoved(marketId, msg.sender, collateralToReturn, lpAmount, extraYes, extraNo);
    }

    function buyYes(
        uint256 marketId,
        uint256 collateralAmount,
        uint256 minShares
    ) external nonReentrant {
        Market storage market = markets[marketId];
        require(!market.resolved, "Market resolved");
        require(block.timestamp < market.expirationTimestamp, "Market expired");
        require(market.yesSharesPool > 0 && market.noSharesPool > 0, "No liquidity in pool");
        require(collateralAmount > 0, "Amount must be > 0");

        collateralToken.safeTransferFrom(msg.sender, address(this), collateralAmount);

        uint256 fee = (collateralAmount * feePercent) / 10000;
        uint256 tradeAmount = collateralAmount - fee;

        // CPMM Buy YES math: dy = tradeAmount * (1 + y / (n + tradeAmount))
        uint256 y = market.yesSharesPool;
        uint256 n = market.noSharesPool;
        uint256 sharesToUser = tradeAmount + (tradeAmount * y) / (n + tradeAmount);

        require(sharesToUser >= minShares, "Slippage limit exceeded");

        // Update pool: y' = y + fee - (sharesToUser - collateralAmount) = y + fee - sharesToUser + collateralAmount
        // Since we mint collateralAmount YES/NO, and user gets sharesToUser YES shares,
        // the pool YES balance is decreased by sharesToUser - collateralAmount.
        // We also add fee to the pool YES/NO to distribute trading fee to LPs.
        // Net pool YES change: +collateralAmount - sharesToUser + fee = +tradeAmount + fee + fee - sharesToUser = +collateralAmount + fee - sharesToUser
        // Wait, yesSharesPool new is: y_new = y + collateralAmount + fee - sharesToUser.
        // Let's verify: yesSharesPool = y + collateralAmount - sharesToUser + fee.
        // Let's check NO pool change: we mint collateralAmount NO, add all to pool, and also add fee to the pool.
        // Net pool NO change: +collateralAmount + fee.
        // Let's implement this simply:
        market.yesSharesPool = y + collateralAmount + fee - sharesToUser;
        market.noSharesPool = n + collateralAmount + fee;

        yesShares[marketId][msg.sender] += sharesToUser;

        emit SharesTraded(marketId, msg.sender, true, true, collateralAmount, sharesToUser);
    }

    function buyNo(
        uint256 marketId,
        uint256 collateralAmount,
        uint256 minShares
    ) external nonReentrant {
        Market storage market = markets[marketId];
        require(!market.resolved, "Market resolved");
        require(block.timestamp < market.expirationTimestamp, "Market expired");
        require(market.yesSharesPool > 0 && market.noSharesPool > 0, "No liquidity in pool");
        require(collateralAmount > 0, "Amount must be > 0");

        collateralToken.safeTransferFrom(msg.sender, address(this), collateralAmount);

        uint256 fee = (collateralAmount * feePercent) / 10000;
        uint256 tradeAmount = collateralAmount - fee;

        // CPMM Buy NO math: dn = tradeAmount * (1 + n / (y + tradeAmount))
        uint256 y = market.yesSharesPool;
        uint256 n = market.noSharesPool;
        uint256 sharesToUser = tradeAmount + (tradeAmount * n) / (y + tradeAmount);

        require(sharesToUser >= minShares, "Slippage limit exceeded");

        // Symmetric pool updates
        market.noSharesPool = n + collateralAmount + fee - sharesToUser;
        market.yesSharesPool = y + collateralAmount + fee;

        noShares[marketId][msg.sender] += sharesToUser;

        emit SharesTraded(marketId, msg.sender, false, true, collateralAmount, sharesToUser);
    }

    function sellYes(
        uint256 marketId,
        uint256 sharesAmount,
        uint256 minCollateral
    ) external nonReentrant {
        Market storage market = markets[marketId];
        require(!market.resolved, "Market resolved");
        require(yesShares[marketId][msg.sender] >= sharesAmount, "Insufficient shares");
        require(sharesAmount > 0, "Amount must be > 0");

        uint256 y = market.yesSharesPool;
        uint256 n = market.noSharesPool;

        // CPMM Sell YES: c^2 - b*c + d = 0 where b = s + y + n and d = s * n
        uint256 b = sharesAmount + y + n;
        uint256 d = sharesAmount * n;
        uint256 root = Math.sqrt(b * b - 4 * d);
        uint256 c = (b - root) / 2;

        uint256 fee = (c * feePercent) / 10000;
        uint256 netCollateral = c - fee;

        require(netCollateral >= minCollateral, "Slippage limit exceeded");

        yesShares[marketId][msg.sender] -= sharesAmount;
        
        // Pool changes:
        // yesSharesPool = y + s - c + f
        // noSharesPool = n - c + f
        market.yesSharesPool = y + sharesAmount - c + fee;
        market.noSharesPool = n - c + fee;

        collateralToken.safeTransfer(msg.sender, netCollateral);

        emit SharesTraded(marketId, msg.sender, true, false, netCollateral, sharesAmount);
    }

    function sellNo(
        uint256 marketId,
        uint256 sharesAmount,
        uint256 minCollateral
    ) external nonReentrant {
        Market storage market = markets[marketId];
        require(!market.resolved, "Market resolved");
        require(noShares[marketId][msg.sender] >= sharesAmount, "Insufficient shares");
        require(sharesAmount > 0, "Amount must be > 0");

        uint256 y = market.yesSharesPool;
        uint256 n = market.noSharesPool;

        // CPMM Sell NO: c^2 - b*c + d = 0 where b = s + y + n and d = s * y
        uint256 b = sharesAmount + y + n;
        uint256 d = sharesAmount * y;
        uint256 root = Math.sqrt(b * b - 4 * d);
        uint256 c = (b - root) / 2;

        uint256 fee = (c * feePercent) / 10000;
        uint256 netCollateral = c - fee;

        require(netCollateral >= minCollateral, "Slippage limit exceeded");

        noShares[marketId][msg.sender] -= sharesAmount;

        // Pool changes:
        // noSharesPool = n + s - c + f
        // yesSharesPool = y - c + f
        market.noSharesPool = n + sharesAmount - c + fee;
        market.yesSharesPool = y - c + fee;

        collateralToken.safeTransfer(msg.sender, netCollateral);

        emit SharesTraded(marketId, msg.sender, false, false, netCollateral, sharesAmount);
    }

    function resolveMarket(uint256 marketId, uint8 outcome) external onlyOwner {
        Market storage market = markets[marketId];
        require(!market.resolved, "Already resolved");
        require(outcome == 1 || outcome == 2 || outcome == 3, "Invalid outcome");

        market.resolved = true;
        market.outcome = outcome;

        emit MarketResolved(marketId, outcome);
    }

    function claimWinnings(uint256 marketId) external nonReentrant {
        Market storage market = markets[marketId];
        require(market.resolved, "Market not resolved");

        uint256 payout = 0;

        if (market.outcome == 1) {
            // YES won: YES shares are worth 1 collateral, NO shares are worth 0
            payout = yesShares[marketId][msg.sender];
            yesShares[marketId][msg.sender] = 0;
        } else if (market.outcome == 2) {
            // NO won: NO shares are worth 1 collateral, YES shares are worth 0
            payout = noShares[marketId][msg.sender];
            noShares[marketId][msg.sender] = 0;
        } else if (market.outcome == 3) {
            // Invalid/Cancelled: Refund both YES and NO shares at 0.5 collateral each
            payout = (yesShares[marketId][msg.sender] + noShares[marketId][msg.sender]) / 2;
            yesShares[marketId][msg.sender] = 0;
            noShares[marketId][msg.sender] = 0;
        }

        // Payout to liquidity providers after resolution
        uint256 lpBalance = lpBalances[marketId][msg.sender];
        if (lpBalance > 0) {
            uint256 lpPayout = 0;
            uint256 totalLP = market.lpTokenTotalSupply;

            if (market.outcome == 1) {
                // LP value is based on YES shares in pool
                lpPayout = (market.yesSharesPool * lpBalance) / totalLP;
            } else if (market.outcome == 2) {
                // LP value is based on NO shares in pool
                lpPayout = (market.noSharesPool * lpBalance) / totalLP;
            } else if (market.outcome == 3) {
                // LP value is based on half of the total shares in pool
                lpPayout = ((market.yesSharesPool + market.noSharesPool) * lpBalance) / (2 * totalLP);
            }

            lpBalances[marketId][msg.sender] = 0;
            payout += lpPayout;
        }

        require(payout > 0, "No winnings to claim");
        collateralToken.safeTransfer(msg.sender, payout);

        emit WinningsClaimed(marketId, msg.sender, payout);
    }
}
