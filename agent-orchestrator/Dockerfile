FROM node:18-alpine

WORKDIR /app

# Install system dependencies
RUN apk add --no-cache git curl

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY src/ ./src/
COPY config/ ./config/

# Create non-root user
RUN addgroup -g 1000 agent && \
    adduser -D -s /bin/sh -u 1000 -G agent agent

# Create logs directory
RUN mkdir -p /app/logs && chown -R agent:agent /app

USER agent

EXPOSE 9000

CMD ["node", "src/server.js"]