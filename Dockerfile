FROM node:20-alpine AS base

WORKDIR /app

FROM base AS frontend-build
COPY frontend/package*.json ./frontend/
RUN npm ci --prefix frontend --no-audit --no-fund
COPY frontend ./frontend
RUN npm run build --prefix frontend

FROM base AS backend-deps
COPY backend/package*.json ./backend/
RUN npm ci --prefix backend --omit=dev --no-audit --no-fund

FROM base AS runtime

ENV NODE_ENV=production
ENV PORT=10000

COPY --from=backend-deps /app/backend/node_modules ./backend/node_modules
COPY backend ./backend
COPY --from=frontend-build /app/frontend/dist ./frontend/dist
COPY package*.json ./

EXPOSE 10000

CMD ["node", "backend/server.js"]
