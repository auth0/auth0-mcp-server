# ---- Build stage ----
FROM node:22-slim AS builder
WORKDIR /app
COPY . .
RUN npm i --ignore-scripts
RUN npx tsc
RUN npm prune --omit=dev --ignore-scripts

# ---- Production stage ----
FROM node:22-slim AS runner
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./package.json
ENV AUTH0_DOMAIN=""
ENV AUTH0_TOKEN=""
CMD ["node", "dist/smithery.js"]
