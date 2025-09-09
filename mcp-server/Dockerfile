FROM node:18-alpine

WORKDIR /app

# Install git and other dependencies
RUN apk add --no-cache git openssh-client curl

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY src/ ./src/
COPY config/ ./config/

# Create non-root user
RUN addgroup -g 1000 mcp && \
    adduser -D -s /bin/sh -u 1000 -G mcp mcp

# Set ownership
RUN chown -R mcp:mcp /app

USER mcp

EXPOSE 8080

CMD ["node", "src/server.js"]