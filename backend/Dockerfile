FROM node:22-alpine

WORKDIR /usr/src/app

COPY package*.json tsconfig.json ./
RUN npm install

COPY prisma ./prisma
RUN npx prisma generate

COPY src ./src

EXPOSE 4000

CMD ["sh", "-c", "npx prisma db push && npm run dev"]
