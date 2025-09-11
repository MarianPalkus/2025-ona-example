const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const WebSocket = require('ws');
const http = require('http');

const gitService = require('./services/gitService');
const giteaService = require('./services/giteaService');
const mcpHandler = require('./handlers/mcpHandler');
const issueHandler = require('./handlers/issueHandler');
const webhookHandler = require('./handlers/webhookHandler');
const logger = require('./utils/logger');
const config = require('./config');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Middleware
app.use(helmet());
app.use(cors());
app.use(morgan('combined', { stream: { write: message => logger.info(message.trim()) } }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// MCP Protocol endpoints
app.use('/mcp', mcpHandler);

// Git operations
app.use('/git', require('./routes/git'));

// Gitea integration
app.use('/gitea', require('./routes/gitea'));

// Issue management (human-in-the-loop)
app.use('/issues', issueHandler);

// Webhooks from Gitea
app.use('/webhooks', webhookHandler);

// WebSocket for real-time communication
wss.on('connection', (ws, req) => {
  logger.info('WebSocket connection established');
  
  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);
      await handleWebSocketMessage(ws, data);
    } catch (error) {
      logger.error('WebSocket message error:', error);
      ws.send(JSON.stringify({ error: 'Invalid message format' }));
    }
  });

  ws.on('close', () => {
    logger.info('WebSocket connection closed');
  });
});

async function handleWebSocketMessage(ws, data) {
  const { type, payload } = data;

  switch (type) {
    case 'subscribe_repository':
      // Subscribe to repository events
      ws.repositoryId = payload.repositoryId;
      ws.send(JSON.stringify({ type: 'subscribed', repositoryId: payload.repositoryId }));
      break;

    case 'agent_status':
      // Agent status update
      broadcastToRepository(payload.repositoryId, {
        type: 'agent_status',
        status: payload.status,
        message: payload.message
      });
      break;

    case 'human_input_request':
      // Request human input via issue
      await requestHumanInput(payload);
      break;

    default:
      ws.send(JSON.stringify({ error: 'Unknown message type' }));
  }
}

function broadcastToRepository(repositoryId, message) {
  wss.clients.forEach(client => {
    if (client.repositoryId === repositoryId && client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  });
}

async function requestHumanInput(payload) {
  try {
    const issue = await giteaService.createIssue({
      owner: payload.owner,
      repo: payload.repo,
      title: `[AI Agent] ${payload.title}`,
      body: `## Agent Request for Human Input

${payload.description}

### Context
- **Repository**: ${payload.owner}/${payload.repo}
- **Branch**: ${payload.branch || 'main'}
- **Agent Task**: ${payload.agentTask}

### Current Status
${payload.currentStatus}

### Question/Request
${payload.question}

### Options
${payload.options ? payload.options.map((opt, i) => `${i + 1}. ${opt}`).join('\n') : 'Please provide guidance in comments.'}

---
*This issue was created automatically by an AI agent. Please respond with your input in the comments.*`,
      labels: ['ai-agent', 'human-input-required']
    });

    logger.info(`Created human input issue: ${issue.html_url}`);
    
    // Broadcast to connected clients
    broadcastToRepository(`${payload.owner}/${payload.repo}`, {
      type: 'human_input_requested',
      issue: issue
    });

  } catch (error) {
    logger.error('Failed to create human input issue:', error);
  }
}

// Error handling
app.use((error, req, res, next) => {
  logger.error('Unhandled error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  server.close(() => {
    process.exit(0);
  });
});

const PORT = process.env.MCP_PORT || 8089;
server.listen(PORT, () => {
  logger.info(`MCP Git Server listening on port ${PORT}`);
  logger.info(`Gitea URL: ${config.gitea.url}`);
});

module.exports = app;
