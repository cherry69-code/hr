FROM node:20-alpine
WORKDIR /app
COPY services/notification-service ./services/notification-service
WORKDIR /app/services/notification-service
RUN npm install
RUN npm run build
ENV NODE_ENV=production
CMD ["node", "dist/server.js"]

