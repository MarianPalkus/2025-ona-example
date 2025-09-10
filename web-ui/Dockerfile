FROM node:18-alpine

# Set working directory
WORKDIR /app

# Create app directory and set ownership
RUN mkdir -p /app && chown -R node:node /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy application code
COPY . .

# Change ownership of the app directory to node user
RUN chown -R node:node /app

# Switch to node user for security
USER node

# Expose port
EXPOSE 4000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:4000/health || exit 1

# Start the application
CMD ["npm", "start"]
