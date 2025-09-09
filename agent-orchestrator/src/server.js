const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const WebSocket = require('ws');
const http = require('http');
require('dotenv').config();

const agentService = require('./services/agentService');
const taskQueue = require('./services/taskQueue');
const mcpClient = require('./services/mcpClient');
const giteaClient = require('./services/giteaClient');
const humanLoopService = require('./services/humanLoopService');
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
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    services: {
      mcp: mcpClient.isConnected(),
      gitea: giteaClient.isConnected(),
      queue: taskQueue.isReady()
    }
  });
});

// Task management endpoints
app.use('/tasks', require('./routes/tasks'));

// Agent management endpoints
app.use('/agents', require('./routes/agents'));

// Human-in-the-loop endpoints
app.use('/human-loop', require('./routes/humanLoop'));

// Repository management
app.use('/repositories', require('./routes/repositories'));

// WebSocket for real-time updates
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
    case 'subscribe_task':
      ws.taskId = payload.taskId;
      ws.send(JSON.stringify({ type: 'subscribed', taskId: payload.taskId }));
      break;

    case 'subscribe_repository':
      ws.repositoryId = payload.repositoryId;
      ws.send(JSON.stringify({ type: 'subscribed', repositoryId: payload.repositoryId }));
      break;

    case 'agent_command':
      await handleAgentCommand(ws, payload);
      break;

    case 'human_response':
      await humanLoopService.processHumanResponse(payload);
      break;

    default:
      ws.send(JSON.stringify({ error: 'Unknown message type' }));
  }
}

async function handleAgentCommand(ws, payload) {
  try {
    const result = await agentService.executeCommand(payload);
    ws.send(JSON.stringify({ type: 'command_result', result }));
  } catch (error) {
    logger.error('Agent command error:', error);
    ws.send(JSON.stringify({ type: 'command_error', error: error.message }));
  }
}

function broadcastToTask(taskId, message) {
  wss.clients.forEach(client => {
    if (client.taskId === taskId && client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  });
}

function broadcastToRepository(repositoryId, message) {
  wss.clients.forEach(client => {
    if (client.repositoryId === repositoryId && client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  });
}

// Task queue event handlers
taskQueue.on('task:started', (task) => {
  logger.info(`Task started: ${task.id}`);
  broadcastToTask(task.id, { type: 'task_started', task });
  broadcastToRepository(task.repositoryId, { type: 'task_started', task });
});

taskQueue.on('task:progress', (task, progress) => {
  logger.info(`Task progress: ${task.id} - ${progress.message}`);
  broadcastToTask(task.id, { type: 'task_progress', task, progress });
  broadcastToRepository(task.repositoryId, { type: 'task_progress', task, progress });
});

taskQueue.on('task:completed', (task, result) => {
  logger.info(`Task completed: ${task.id}`);
  broadcastToTask(task.id, { type: 'task_completed', task, result });
  broadcastToRepository(task.repositoryId, { type: 'task_completed', task, result });
});

taskQueue.on('task:failed', (task, error) => {
  logger.error(`Task failed: ${task.id} - ${error.message}`);
  broadcastToTask(task.id, { type: 'task_failed', task, error: error.message });
  broadcastToRepository(task.repositoryId, { type: 'task_failed', task, error: error.message });
});

taskQueue.on('task:human_input_required', async (task, context) => {
  logger.info(`Human input required for task: ${task.id}`);
  
  try {
    const issue = await humanLoopService.requestHumanInput(task, context);
    broadcastToTask(task.id, { type: 'human_input_required', task, issue });
    broadcastToRepository(task.repositoryId, { type: 'human_input_required', task, issue });
  } catch (error) {
    logger.error('Failed to request human input:', error);
  }
});

// Initialize services
async function initializeServices() {
  try {
    await mcpClient.connect();
    await giteaClient.connect();
    await taskQueue.initialize();
    await humanLoopService.initialize();
    
    logger.info('All services initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize services:', error);
    process.exit(1);
  }
}

// Error handling
app.use((error, req, res, next) => {
  logger.error('Unhandled error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  
  try {
    await taskQueue.close();
    await mcpClient.disconnect();
    await giteaClient.disconnect();
  } catch (error) {
    logger.error('Error during shutdown:', error);
  }
  
  server.close(() => {
    process.exit(0);
  });
});

// Start server
const PORT = process.env.PORT || 9000;

initializeServices().then(() => {
  server.listen(PORT, () => {
    logger.info(`Agent Orchestrator listening on port ${PORT}`);
    logger.info(`MCP Server: ${config.mcp.serverUrl}`);
    logger.info(`Gitea URL: ${config.gitea.url}`);
  });
});

// Export for testing
module.exports = { app, broadcastToTask, broadcastToRepository };