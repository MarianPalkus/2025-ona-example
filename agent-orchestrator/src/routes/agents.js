const express = require('express');
const agentService = require('../services/agentService');
const logger = require('../utils/logger');

const router = express.Router();

// Get all active agents
router.get('/', async (req, res) => {
  try {
    const agents = agentService.listActiveAgents();

    res.json({
      agents: agents,
      total: agents.length
    });

  } catch (error) {
    logger.error('Failed to list agents:', error);
    res.status(500).json({
      error: 'Failed to retrieve agents',
      details: error.message
    });
  }
});

// Get specific agent by ID
router.get('/:agentId', async (req, res) => {
  try {
    const { agentId } = req.params;

    const agent = agentService.getAgent(agentId);

    if (!agent) {
      return res.status(404).json({
        error: 'Agent not found'
      });
    }

    res.json(agent);

  } catch (error) {
    logger.error(`Failed to get agent ${req.params.agentId}:`, error);
    res.status(500).json({
      error: 'Failed to retrieve agent',
      details: error.message
    });
  }
});

// Create a new agent
router.post('/', async (req, res) => {
  try {
    const {
      type = 'claude',
      taskId,
      repositoryInfo
    } = req.body;

    if (!taskId) {
      return res.status(400).json({
        error: 'Task ID is required'
      });
    }

    if (!repositoryInfo) {
      return res.status(400).json({
        error: 'Repository information is required'
      });
    }

    const agent = await agentService.createAgent(type, taskId, repositoryInfo);

    logger.info(`Agent created: ${agent.id}`);

    res.status(201).json({
      message: 'Agent created successfully',
      agent: {
        id: agent.id,
        type: agent.type,
        taskId: agent.taskId,
        status: agent.status,
        capabilities: agent.capabilities,
        createdAt: agent.createdAt
      }
    });

  } catch (error) {
    logger.error('Failed to create agent:', error);
    res.status(500).json({
      error: 'Failed to create agent',
      details: error.message
    });
  }
});

// Terminate an agent
router.delete('/:agentId', async (req, res) => {
  try {
    const { agentId } = req.params;

    const agent = agentService.getAgent(agentId);
    if (!agent) {
      return res.status(404).json({
        error: 'Agent not found'
      });
    }

    await agentService.terminateAgent(agentId);

    logger.info(`Agent terminated: ${agentId}`);

    res.json({
      message: 'Agent terminated successfully',
      agentId: agentId
    });

  } catch (error) {
    logger.error(`Failed to terminate agent ${req.params.agentId}:`, error);
    res.status(500).json({
      error: 'Failed to terminate agent',
      details: error.message
    });
  }
});

// Execute command with agent
router.post('/:agentId/execute', async (req, res) => {
  try {
    const { agentId } = req.params;
    const { command, context } = req.body;

    if (!command) {
      return res.status(400).json({
        error: 'Command is required'
      });
    }

    const agent = agentService.getAgent(agentId);
    if (!agent) {
      return res.status(404).json({
        error: 'Agent not found'
      });
    }

    const result = await agentService.executeCommand(agent, command, context);

    res.json({
      message: 'Command executed successfully',
      result: result
    });

  } catch (error) {
    logger.error(`Failed to execute command for agent ${req.params.agentId}:`, error);
    res.status(500).json({
      error: 'Failed to execute command',
      details: error.message
    });
  }
});

// Get agent capabilities
router.get('/:agentId/capabilities', async (req, res) => {
  try {
    const { agentId } = req.params;

    const agent = agentService.getAgent(agentId);
    if (!agent) {
      return res.status(404).json({
        error: 'Agent not found'
      });
    }

    res.json({
      agentId: agentId,
      type: agent.type,
      capabilities: agent.capabilities
    });

  } catch (error) {
    logger.error(`Failed to get capabilities for agent ${req.params.agentId}:`, error);
    res.status(500).json({
      error: 'Failed to retrieve agent capabilities',
      details: error.message
    });
  }
});

// Get agent context
router.get('/:agentId/context', async (req, res) => {
  try {
    const { agentId } = req.params;

    const agent = agentService.getAgent(agentId);
    if (!agent) {
      return res.status(404).json({
        error: 'Agent not found'
      });
    }

    // Return sanitized context (remove sensitive information)
    const sanitizedContext = {
      workingDirectory: agent.context.workingDirectory,
      repositoryStructure: agent.context.repositoryStructure,
      currentFiles: agent.context.currentFiles,
      containerId: agent.context.containerId,
      conversationHistory: agent.context.conversationHistory?.length || 0
    };

    res.json({
      agentId: agentId,
      context: sanitizedContext
    });

  } catch (error) {
    logger.error(`Failed to get context for agent ${req.params.agentId}:`, error);
    res.status(500).json({
      error: 'Failed to retrieve agent context',
      details: error.message
    });
  }
});

// Process human response for agent
router.post('/:agentId/human-response', async (req, res) => {
  try {
    const { agentId } = req.params;
    const { response } = req.body;

    if (!response) {
      return res.status(400).json({
        error: 'Response is required'
      });
    }

    const agent = agentService.getAgent(agentId);
    if (!agent) {
      return res.status(404).json({
        error: 'Agent not found'
      });
    }

    const result = await agentService.processHumanResponse(agentId, response);

    logger.info(`Human response processed for agent ${agentId}`);

    res.json({
      message: 'Human response processed successfully',
      agentId: agentId,
      status: result.status
    });

  } catch (error) {
    logger.error(`Failed to process human response for agent ${req.params.agentId}:`, error);
    res.status(500).json({
      error: 'Failed to process human response',
      details: error.message
    });
  }
});

// Get agent statistics
router.get('/stats/overview', async (req, res) => {
  try {
    const agents = agentService.listActiveAgents();
    
    const stats = {
      total: agents.length,
      byType: {},
      byStatus: {},
      byTask: {}
    };

    agents.forEach(agent => {
      // Count by type
      stats.byType[agent.type] = (stats.byType[agent.type] || 0) + 1;
      
      // Count by status
      stats.byStatus[agent.status] = (stats.byStatus[agent.status] || 0) + 1;
      
      // Count by task type (if available)
      if (agent.taskType) {
        stats.byTask[agent.taskType] = (stats.byTask[agent.taskType] || 0) + 1;
      }
    });

    res.json({
      statistics: stats,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Failed to get agent statistics:', error);
    res.status(500).json({
      error: 'Failed to retrieve agent statistics',
      details: error.message
    });
  }
});

// Get available agent types and their capabilities
router.get('/types/available', async (req, res) => {
  try {
    const agentTypes = {
      claude: {
        name: 'Claude',
        provider: 'Anthropic',
        capabilities: agentService.getAgentCapabilities('claude'),
        description: 'Advanced reasoning and planning, code architecture analysis, complex problem solving'
      },
      openai: {
        name: 'OpenAI GPT',
        provider: 'OpenAI',
        capabilities: agentService.getAgentCapabilities('openai'),
        description: 'Code completion and suggestions, bug detection, performance optimization'
      }
    };

    res.json({
      agentTypes: agentTypes,
      total: Object.keys(agentTypes).length
    });

  } catch (error) {
    logger.error('Failed to get available agent types:', error);
    res.status(500).json({
      error: 'Failed to retrieve agent types',
      details: error.message
    });
  }
});

// Health check for agents
router.get('/health/check', async (req, res) => {
  try {
    const agents = agentService.listActiveAgents();
    const healthChecks = [];

    for (const agent of agents) {
      const health = {
        agentId: agent.id,
        type: agent.type,
        status: agent.status,
        healthy: agent.status !== 'failed' && agent.status !== 'terminated',
        lastActivity: agent.context.lastAction || agent.createdAt,
        containerId: agent.context.containerId
      };

      // Check container health if available
      if (agent.context.containerId) {
        try {
          const devContainerService = require('../services/devContainerService');
          const containerStatus = await devContainerService.getContainerStatus(agent.context.containerId);
          health.containerHealthy = containerStatus.status === 'running';
        } catch (error) {
          health.containerHealthy = false;
          health.containerError = error.message;
        }
      }

      healthChecks.push(health);
    }

    const summary = {
      total: healthChecks.length,
      healthy: healthChecks.filter(h => h.healthy).length,
      unhealthy: healthChecks.filter(h => !h.healthy).length,
      withContainers: healthChecks.filter(h => h.containerId).length
    };

    res.json({
      summary: summary,
      agents: healthChecks,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Failed to perform agent health check:', error);
    res.status(500).json({
      error: 'Failed to perform health check',
      details: error.message
    });
  }
});

module.exports = router;