FROM node:20-alpine
WORKDIR /app
COPY prisma ./prisma
COPY workers/payroll-worker ./workers/payroll-worker
WORKDIR /app/workers/payroll-worker
RUN npm install
RUN npx prisma generate --schema /app/prisma/schema.prisma
RUN npm run build
ENV NODE_ENV=production
CMD ["node", "dist/index.js"]

