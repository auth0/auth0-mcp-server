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
EXPOSE 8080
ENV TRANSPORT=http
CMD ["node", "dist/smithery.js"]
