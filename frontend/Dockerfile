FROM node:22-alpine

WORKDIR /usr/src/app

COPY package*.json tsconfig.json tailwind.config.ts postcss.config.js next-env.d.ts next.config.ts ./
RUN npm install

COPY src ./src

EXPOSE 3000

CMD ["npm", "run", "dev"]
