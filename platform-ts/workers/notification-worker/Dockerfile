FROM node:20-alpine
WORKDIR /app
COPY workers/notification-worker ./workers/notification-worker
WORKDIR /app/workers/notification-worker
RUN npm install
RUN npm run build
ENV NODE_ENV=production
CMD ["node", "dist/index.js"]

