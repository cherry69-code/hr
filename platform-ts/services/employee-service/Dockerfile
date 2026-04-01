FROM node:20-alpine
WORKDIR /app
COPY prisma ./prisma
COPY services/employee-service ./services/employee-service
WORKDIR /app/services/employee-service
RUN npm install
RUN npx prisma generate --schema /app/prisma/schema.prisma
RUN npm run build
ENV NODE_ENV=production
CMD ["node", "dist/server.js"]

