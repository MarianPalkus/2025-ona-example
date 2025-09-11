const path = require('path');

const config = {
  // Server configuration
  server: {
    port: process.env.PORT || 9000,
    host: process.env.HOST || '0.0.0.0',
    env: process.env.NODE_ENV || 'development'
  },

  // MCP Server configuration
  mcp: {
    serverUrl: process.env.MCP_SERVER_URL || 'http://mcp-git-server:8080',
    timeout: parseInt(process.env.MCP_TIMEOUT) || 30000,
    retries: parseInt(process.env.MCP_RETRIES) || 3
  },

  // Gitea configuration
  gitea: {
    url: process.env.GITEA_URL || 'http://gitea:3000',
    token: process.env.GITEA_TOKEN,
    webhookSecret: process.env.GITEA_WEBHOOK_SECRET,
    timeout: parseInt(process.env.GITEA_TIMEOUT) || 30000
  },

  // AI Provider configuration
  ai: {
    anthropic: {
      apiKey: process.env.ANTHROPIC_API_KEY,
      model: process.env.ANTHROPIC_MODEL || 'claude-3-sonnet-20240229',
      maxTokens: parseInt(process.env.ANTHROPIC_MAX_TOKENS) || 4000,
      rateLimitRPM: parseInt(process.env.ANTHROPIC_RATE_LIMIT_RPM) || 50
    },
    openai: {
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_MODEL || 'gpt-4',
      maxTokens: parseInt(process.env.OPENAI_MAX_TOKENS) || 4000,
      rateLimitRPM: parseInt(process.env.OPENAI_RATE_LIMIT_RPM) || 60
    }
  },

  // Agent configuration
  agents: {
    maxConcurrentTasks: parseInt(process.env.MAX_CONCURRENT_TASKS) || 5,
    taskTimeoutMinutes: parseInt(process.env.TASK_TIMEOUT_MINUTES) || 60,
    humanInputTimeoutHours: parseInt(process.env.HUMAN_INPUT_TIMEOUT_HOURS) || 24,
    autoCommitEnabled: process.env.AUTO_COMMIT_ENABLED === 'true',
    defaultBranch: process.env.GIT_DEFAULT_BRANCH || 'main'
  },

  // Dev Container configuration
  devContainers: {
    enabled: process.env.DEV_CONTAINERS_ENABLED !== 'false',
    cliPath: process.env.DEVCONTAINER_CLI_PATH || 'devcontainer',
    workspaceRoot: process.env.CONTAINER_WORKSPACE_ROOT || '/tmp/agent-workspaces',
    cleanupInterval: parseInt(process.env.CONTAINER_CLEANUP_INTERVAL) || 3600000, // 1 hour
    maxConcurrentContainers: parseInt(process.env.MAX_CONCURRENT_CONTAINERS) || 10,
    memoryLimit: process.env.CONTAINER_MEMORY_LIMIT || '2g',
    cpuLimit: process.env.CONTAINER_CPU_LIMIT || '1.0'
  },

  // Logging configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    retentionDays: parseInt(process.env.LOG_RETENTION_DAYS) || 30,
    format: process.env.LOG_FORMAT || 'json'
  },

  // Security configuration
  security: {
    jwtSecret: process.env.JWT_SECRET,
    sessionSecret: process.env.SESSION_SECRET,
    webhookSecret: process.env.WEBHOOK_SECRET,
    corsOrigins: process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : ['*']
  },

  // Database configuration (if needed)
  database: {
    url: process.env.DATABASE_URL,
    type: process.env.DATABASE_TYPE || 'sqlite',
    host: process.env.DATABASE_HOST || 'localhost',
    port: parseInt(process.env.DATABASE_PORT) || 5432,
    name: process.env.DATABASE_NAME || 'agent_orchestrator',
    username: process.env.DATABASE_USERNAME,
    password: process.env.DATABASE_PASSWORD
  },

  // Redis configuration (for task queue)
  redis: {
    url: process.env.REDIS_URL || 'redis://redis:6379',
    host: process.env.REDIS_HOST || 'redis',
    port: parseInt(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB) || 0
  },

  // Monitoring configuration
  monitoring: {
    enabled: process.env.MONITORING_ENABLED === 'true',
    metricsEnabled: process.env.METRICS_ENABLED === 'true',
    healthCheckInterval: parseInt(process.env.HEALTH_CHECK_INTERVAL_SECONDS) || 30,
    prometheusPort: parseInt(process.env.PROMETHEUS_PORT) || 9090
  },

  // Backup configuration
  backup: {
    enabled: process.env.BACKUP_ENABLED === 'true',
    intervalHours: parseInt(process.env.BACKUP_INTERVAL_HOURS) || 24,
    retentionDays: parseInt(process.env.BACKUP_RETENTION_DAYS) || 7,
    path: process.env.BACKUP_PATH || './backups'
  },

  // Paths
  paths: {
    logs: process.env.LOGS_PATH || './logs',
    repositories: process.env.REPOSITORIES_PATH || './repositories',
    temp: process.env.TEMP_PATH || './temp',
    config: process.env.CONFIG_PATH || './config'
  }
};

// Validation
function validateConfig() {
  const errors = [];

  // Check required AI provider keys
  if (!config.ai.anthropic.apiKey && !config.ai.openai.apiKey) {
    errors.push('At least one AI provider API key (ANTHROPIC_API_KEY or OPENAI_API_KEY) is required');
  }

  // Check Gitea token
  if (!config.gitea.token) {
    console.warn('GITEA_TOKEN not provided, some Gitea operations may fail');
  }

  // Check security secrets
  if (!config.security.jwtSecret) {
    console.warn('JWT_SECRET not provided, using default (not secure for production)');
    config.security.jwtSecret = 'default-jwt-secret-change-in-production';
  }

  if (!config.security.webhookSecret) {
    console.warn('WEBHOOK_SECRET not provided, webhook verification disabled');
  }

  if (errors.length > 0) {
    throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
  }
}

// Environment-specific overrides
if (config.server.env === 'production') {
  // Production overrides
  config.logging.level = 'warn';
  config.devContainers.cleanupInterval = 1800000; // 30 minutes
  config.agents.maxConcurrentTasks = 10;
} else if (config.server.env === 'development') {
  // Development overrides
  config.logging.level = 'debug';
  config.devContainers.cleanupInterval = 300000; // 5 minutes
}

// Validate configuration on load
try {
  validateConfig();
} catch (error) {
  console.error('Configuration Error:', error.message);
  process.exit(1);
}

module.exports = config;