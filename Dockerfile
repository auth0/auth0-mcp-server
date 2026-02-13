
FROM node:22.12-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY tsconfig.json ./
COPY src/ ./src/
COPY utils/ ./utils/
COPY eslint.config.js ./
COPY vitest.config.ts ./
COPY glama.json ./

RUN --mount=type=cache,target=/root/.npm npm ci

RUN npm run build


FROM node:22-alpine AS release

# Install libsecret runtime dependency for keytar
RUN apk add --no-cache libsecret

WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./
COPY --from=builder /app/package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules

ENV NODE_ENV=production
ENV PORT=80

# CMD ["node", "dist/commands/run.js"]
CMD ["npm","run","start:debug"]