FROM node:20-alpine
WORKDIR /app
COPY prisma ./prisma
COPY services/auth-service ./services/auth-service
WORKDIR /app/services/auth-service
RUN npm install
RUN npx prisma generate --schema /app/prisma/schema.prisma
RUN npm run build
ENV NODE_ENV=production
CMD ["node", "dist/server.js"]

