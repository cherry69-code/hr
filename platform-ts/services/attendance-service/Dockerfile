FROM node:20-alpine
WORKDIR /app
COPY prisma ./prisma
COPY services/attendance-service ./services/attendance-service
WORKDIR /app/services/attendance-service
RUN npm install
RUN npx prisma generate --schema /app/prisma/schema.prisma
RUN npm run build
ENV NODE_ENV=production
CMD ["node", "dist/server.js"]

