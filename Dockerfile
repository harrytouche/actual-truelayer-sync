FROM node:24-alpine AS builder
WORKDIR /build
COPY package.json package-lock.json* ./
ARG ACTUAL_API_VERSION
RUN npm ci --ignore-scripts && \
    if [ -n "$ACTUAL_API_VERSION" ]; then \
      npm install --ignore-scripts --save-exact "@actual-app/api@$ACTUAL_API_VERSION"; \
    fi
COPY tsconfig.json tsconfig.build.json ./
COPY src/ ./src/
RUN npm run build && npm prune --omit=dev

FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package.json ./
COPY --from=builder /build/node_modules ./node_modules
COPY --from=builder /build/dist ./dist
USER node
CMD ["node", "dist/sync.js"]
