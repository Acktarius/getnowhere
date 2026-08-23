# Multi-stage poke-gateway image. Secrets are mounted at runtime, never copied.
FROM node:22-alpine AS build
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY package.json ./
RUN npm install
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine
WORKDIR /app
RUN apk add --no-cache libstdc++ \
  && addgroup -S poke \
  && adduser -S poke -G poke \
  && mkdir -p /data \
  && chown poke:poke /data
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./
USER poke
ENV NODE_ENV=production
ENV PORT=3456
ENV DB_PATH=/data/poke.db
EXPOSE 3456
VOLUME ["/data"]
CMD ["node", "dist/index.js"]
