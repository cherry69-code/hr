FROM node:20-alpine
WORKDIR /app
COPY services/ws-gateway ./services/ws-gateway
WORKDIR /app/services/ws-gateway
RUN npm install
RUN npm run build
ENV NODE_ENV=production
CMD ["node", "dist/server.js"]

