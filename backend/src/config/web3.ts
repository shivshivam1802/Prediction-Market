import { ethers } from "ethers";
import dotenv from "dotenv";
dotenv.config();

const CONTRACT_ABI = [
  "event MarketCreated(uint256 indexed marketId, string title, string description, string category, uint256 expirationTimestamp, string oracleUrl, address indexed creator)",
  "event SharesTraded(uint256 indexed marketId, address indexed user, bool isYes, bool isBuy, uint256 collateralAmount, uint256 sharesAmount)",
  "event LiquidityAdded(uint256 indexed marketId, address indexed provider, uint256 collateralAmount, uint256 lpShares)",
  "event LiquidityRemoved(uint256 indexed marketId, address indexed provider, uint256 collateralAmount, uint256 lpShares, uint256 yesSharesReturned, uint256 noSharesReturned)",
  "event MarketResolved(uint256 indexed marketId, uint8 outcome)",

  "function markets(uint256) view returns (uint256 id, string title, string description, string category, uint256 expirationTimestamp, bool resolved, uint8 outcome, uint256 yesSharesPool, uint256 noSharesPool, uint256 lpTokenTotalSupply, string oracleUrl, address creator)",
  "function yesShares(uint256, address) view returns (uint256)",
  "function noShares(uint256, address) view returns (uint256)",
  "function lpBalances(uint256, address) view returns (uint256)"
];

const rpcUrl = process.env.RPC_URL || "http://127.0.0.1:8545";
const contractAddress = process.env.CONTRACT_ADDRESS || ethers.ZeroAddress;

export const provider = new ethers.JsonRpcProvider(rpcUrl);
export const contract = new ethers.Contract(contractAddress, CONTRACT_ABI, provider);
