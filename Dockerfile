FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/engine/package.json packages/engine/
COPY packages/server/package.json packages/server/
COPY packages/client/package.json packages/client/
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production PORT=8080 STATIC_DIR=/app/public
COPY --from=build /app/packages/server/dist/index.cjs ./server.cjs
COPY --from=build /app/packages/client/dist ./public
EXPOSE 8080
CMD ["node", "server.cjs"]
