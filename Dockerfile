# Multi-stage Dockerfile for Araa Honey Hub (Standalone Node.js Server)
FROM node:22-alpine AS builder

WORKDIR /app

# Install dependencies needed for build tools
RUN apk add --no-cache libc6-compat

COPY package*.json ./
RUN npm ci

COPY . .

# Build with standalone node-server preset
ENV NITRO_PRESET=node-server
ENV NODE_ENV=production
RUN npm run build

# Production runner stage
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

# Copy output from builder
COPY --from=builder /app/.output ./.output

EXPOSE 3000

CMD ["node", ".output/server/index.mjs"]
