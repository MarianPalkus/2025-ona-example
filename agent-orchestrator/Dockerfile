FROM node:18-alpine

WORKDIR /app

# Install system dependencies
RUN apk add --no-cache git curl

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci # Use --only=production when docker image is not used to run npm dev

# Copy source code
COPY src/ ./src/
COPY config/ ./config/

# Use existing node user (UID/GID 1000)
RUN mkdir -p /app/logs && chown -R node:node /app

USER node

EXPOSE 9000

CMD ["node", "src/server.js"]
