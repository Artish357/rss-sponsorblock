# Build stage
FROM node:18-alpine AS builder
WORKDIR /app
COPY . .
RUN apk add --no-cache python3 make g++ && \
    npm ci && \
    npm run build && \
    npm prune --production

# Production stage
FROM node:18-alpine
WORKDIR /app
RUN apk add --no-cache ffmpeg tini
COPY --from=builder /app ./
USER node

# Use ARG/ENV for dynamic port
ARG SERVER_PORT=3000
ENV SERVER_PORT=$SERVER_PORT
EXPOSE $SERVER_PORT

CMD ["tini", "--", "node", "dist/src/index.js"]

# Dynamic healthcheck using SERVER_PORT
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
    CMD node -e "require('http').get('http://localhost:'+(process.env.SERVER_PORT||3000)+'/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1); });"