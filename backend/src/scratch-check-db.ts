import { prisma } from "./config/db";

async function main() {
  const markets = await prisma.market.findMany();
  console.log("Markets count:", markets.length);
  console.log("Markets:", markets);
  process.exit(0);
}

main().catch(console.error);
