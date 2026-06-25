FROM node:22-alpine

WORKDIR /usr/src/app

COPY package*.json tsconfig.json hardhat.config.ts ./
COPY contracts ./contracts
COPY scripts ./scripts

RUN npm install

# Compile contracts
RUN npx hardhat compile

EXPOSE 8545

# Start hardhat node, wait for it to be ready, run deploy/seed script, then keep node in foreground
CMD ["sh", "-c", "npx hardhat node --hostname 0.0.0.0 & sleep 5 && npx hardhat run scripts/deploy.ts --network localhost && wait"]
