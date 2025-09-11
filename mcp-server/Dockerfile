FROM node:18-alpine

WORKDIR /app

# Install git and other dependencies
RUN apk add --no-cache git openssh-client curl

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci # Use --only=production if docker image will not be used to run npm dev

# Copy source code
COPY src/ ./src/
COPY config/ ./config/

# Use existing node user (UID/GID 1000)
RUN chown -R node:node /app

USER node

EXPOSE 8089

CMD ["node", "src/server.js"]
