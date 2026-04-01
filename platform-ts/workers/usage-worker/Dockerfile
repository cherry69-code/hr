FROM node:20-alpine
WORKDIR /app
COPY prisma ./prisma
COPY workers/usage-worker ./workers/usage-worker
WORKDIR /app/workers/usage-worker
RUN npm install
RUN npx prisma generate --schema /app/prisma/schema.prisma
RUN npm run build
ENV NODE_ENV=production
CMD ["node", "dist/index.js"]

