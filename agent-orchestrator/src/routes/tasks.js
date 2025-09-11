const express = require('express');
const taskQueue = require('../services/taskQueue');
const agentService = require('../services/agentService');
const logger = require('../utils/logger');

const router = express.Router();

// Create a new task
router.post('/', async (req, res) => {
  try {
    const {
      repository,
      description,
      agent = 'claude',
      priority = 'medium',
      type = 'agent-task',
      additionalContext,
      metadata = {}
    } = req.body;

    // Validate required fields
    if (!repository || !repository.url) {
      return res.status(400).json({
        error: 'Repository URL is required'
      });
    }

    if (!description) {
      return res.status(400).json({
        error: 'Task description is required'
      });
    }

    // Create task data
    const taskData = {
      type: type,
      description: description,
      repository: repository,
      agent: agent,
      priority: priority,
      additionalContext: additionalContext,
      metadata: {
        ...metadata,
        createdBy: req.user?.id || 'system',
        createdAt: new Date().toISOString()
      }
    };

    // Add task to queue
    const result = await taskQueue.addTask(taskData);

    logger.info(`Task created: ${result.taskId}`);

    res.status(201).json({
      message: 'Task created successfully',
      task: result
    });

  } catch (error) {
    logger.error('Failed to create task:', error);
    res.status(500).json({
      error: 'Failed to create task',
      details: error.message
    });
  }
});

// Get all tasks with filtering
router.get('/', async (req, res) => {
  try {
    const {
      status,
      agent,
      priority,
      type,
      limit = 50,
      offset = 0
    } = req.query;

    const options = {
      status: status,
      agent: agent,
      priority: priority,
      type: type,
      limit: parseInt(limit),
      offset: parseInt(offset)
    };

    const result = await taskQueue.listTasks(options);

    res.json({
      tasks: result.tasks,
      pagination: result.pagination
    });

  } catch (error) {
    logger.error('Failed to list tasks:', error);
    res.status(500).json({
      error: 'Failed to retrieve tasks',
      details: error.message
    });
  }
});

// Get specific task by ID
router.get('/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;

    const task = await taskQueue.getTaskStatus(taskId);

    if (!task) {
      return res.status(404).json({
        error: 'Task not found'
      });
    }

    res.json(task);

  } catch (error) {
    logger.error(`Failed to get task ${req.params.taskId}:`, error);
    res.status(500).json({
      error: 'Failed to retrieve task',
      details: error.message
    });
  }
});

// Update task status or metadata
router.patch('/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;
    const updates = req.body;

    const currentTask = await taskQueue.getTaskStatus(taskId);
    if (!currentTask) {
      return res.status(404).json({
        error: 'Task not found'
      });
    }

    // Update task status in queue
    taskQueue.updateTaskStatus(taskId, updates.status || currentTask.status, {
      ...updates,
      updatedBy: req.user?.id || 'system',
      updatedAt: new Date().toISOString()
    });

    const updatedTask = await taskQueue.getTaskStatus(taskId);

    logger.info(`Task ${taskId} updated`);

    res.json({
      message: 'Task updated successfully',
      task: updatedTask
    });

  } catch (error) {
    logger.error(`Failed to update task ${req.params.taskId}:`, error);
    res.status(500).json({
      error: 'Failed to update task',
      details: error.message
    });
  }
});

// Pause a task
router.post('/:taskId/pause', async (req, res) => {
  try {
    const { taskId } = req.params;

    await taskQueue.pauseTask(taskId);

    logger.info(`Task ${taskId} paused`);

    res.json({
      message: 'Task paused successfully',
      taskId: taskId
    });

  } catch (error) {
    logger.error(`Failed to pause task ${req.params.taskId}:`, error);
    res.status(500).json({
      error: 'Failed to pause task',
      details: error.message
    });
  }
});

// Resume a task
router.post('/:taskId/resume', async (req, res) => {
  try {
    const { taskId } = req.params;

    await taskQueue.resumeTask(taskId);

    logger.info(`Task ${taskId} resumed`);

    res.json({
      message: 'Task resumed successfully',
      taskId: taskId
    });

  } catch (error) {
    logger.error(`Failed to resume task ${req.params.taskId}:`, error);
    res.status(500).json({
      error: 'Failed to resume task',
      details: error.message
    });
  }
});

// Cancel a task
router.delete('/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;
    const { reason = 'cancelled by user' } = req.body;

    await taskQueue.cancelTask(taskId, reason);

    logger.info(`Task ${taskId} cancelled: ${reason}`);

    res.json({
      message: 'Task cancelled successfully',
      taskId: taskId,
      reason: reason
    });

  } catch (error) {
    logger.error(`Failed to cancel task ${req.params.taskId}:`, error);
    res.status(500).json({
      error: 'Failed to cancel task',
      details: error.message
    });
  }
});

// Retry a failed task
router.post('/:taskId/retry', async (req, res) => {
  try {
    const { taskId } = req.params;

    await taskQueue.retryTask(taskId);

    logger.info(`Task ${taskId} retried`);

    res.json({
      message: 'Task retried successfully',
      taskId: taskId
    });

  } catch (error) {
    logger.error(`Failed to retry task ${req.params.taskId}:`, error);
    res.status(500).json({
      error: 'Failed to retry task',
      details: error.message
    });
  }
});

// Get queue statistics
router.get('/queue/stats', async (req, res) => {
  try {
    const stats = await taskQueue.getQueueStats();

    res.json({
      queue: stats,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Failed to get queue stats:', error);
    res.status(500).json({
      error: 'Failed to retrieve queue statistics',
      details: error.message
    });
  }
});

// Create batch tasks
router.post('/batch', async (req, res) => {
  try {
    const { tasks } = req.body;

    if (!Array.isArray(tasks) || tasks.length === 0) {
      return res.status(400).json({
        error: 'Tasks array is required and must not be empty'
      });
    }

    const results = [];
    const errors = [];

    for (let i = 0; i < tasks.length; i++) {
      try {
        const taskData = {
          ...tasks[i],
          metadata: {
            ...tasks[i].metadata,
            batchId: `batch_${Date.now()}`,
            batchIndex: i,
            createdBy: req.user?.id || 'system'
          }
        };

        const result = await taskQueue.addTask(taskData);
        results.push(result);
      } catch (error) {
        errors.push({
          index: i,
          task: tasks[i],
          error: error.message
        });
      }
    }

    logger.info(`Batch created: ${results.length} tasks, ${errors.length} errors`);

    res.status(201).json({
      message: 'Batch tasks processed',
      successful: results.length,
      failed: errors.length,
      results: results,
      errors: errors
    });

  } catch (error) {
    logger.error('Failed to create batch tasks:', error);
    res.status(500).json({
      error: 'Failed to create batch tasks',
      details: error.message
    });
  }
});

// Process human response for a task
router.post('/:taskId/human-response', async (req, res) => {
  try {
    const { taskId } = req.params;
    const { response, source } = req.body;

    if (!response) {
      return res.status(400).json({
        error: 'Response is required'
      });
    }

    // Get the agent for this task
    const task = await taskQueue.getTaskStatus(taskId);
    if (!task) {
      return res.status(404).json({
        error: 'Task not found'
      });
    }

    // Process human response through agent service
    const agent = agentService.getAgent(task.agentId);
    if (!agent) {
      return res.status(404).json({
        error: 'Agent not found for task'
      });
    }

    await agentService.processHumanResponse(task.agentId, {
      type: response.type,
      content: response.content,
      taskId: taskId,
      source: source
    });

    logger.info(`Human response processed for task ${taskId}`);

    res.json({
      message: 'Human response processed successfully',
      taskId: taskId
    });

  } catch (error) {
    logger.error(`Failed to process human response for task ${req.params.taskId}:`, error);
    res.status(500).json({
      error: 'Failed to process human response',
      details: error.message
    });
  }
});

// Get task logs
router.get('/:taskId/logs', async (req, res) => {
  try {
    const { taskId } = req.params;
    const { limit = 100, offset = 0 } = req.query;

    // This would typically fetch logs from a logging service
    // For now, return a placeholder response
    res.json({
      taskId: taskId,
      logs: [],
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total: 0
      }
    });

  } catch (error) {
    logger.error(`Failed to get logs for task ${req.params.taskId}:`, error);
    res.status(500).json({
      error: 'Failed to retrieve task logs',
      details: error.message
    });
  }
});

// Create specialized task types
router.post('/code-review', async (req, res) => {
  try {
    const { repository, pullRequest, priority = 'medium' } = req.body;

    if (!repository || !pullRequest) {
      return res.status(400).json({
        error: 'Repository and pull request information are required'
      });
    }

    const result = await taskQueue.createReviewTask(pullRequest, repository, priority);

    logger.info(`Code review task created: ${result.taskId}`);

    res.status(201).json({
      message: 'Code review task created successfully',
      task: result
    });

  } catch (error) {
    logger.error('Failed to create code review task:', error);
    res.status(500).json({
      error: 'Failed to create code review task',
      details: error.message
    });
  }
});

router.post('/documentation', async (req, res) => {
  try {
    const { repository, focus = 'general', agent = 'claude', priority = 'low' } = req.body;

    if (!repository) {
      return res.status(400).json({
        error: 'Repository information is required'
      });
    }

    const result = await taskQueue.createDocumentationTask(repository, focus, agent, priority);

    logger.info(`Documentation task created: ${result.taskId}`);

    res.status(201).json({
      message: 'Documentation task created successfully',
      task: result
    });

  } catch (error) {
    logger.error('Failed to create documentation task:', error);
    res.status(500).json({
      error: 'Failed to create documentation task',
      details: error.message
    });
  }
});

router.post('/testing', async (req, res) => {
  try {
    const { repository, framework = 'auto-detect', agent = 'openai', priority = 'medium' } = req.body;

    if (!repository) {
      return res.status(400).json({
        error: 'Repository information is required'
      });
    }

    const result = await taskQueue.createTestingTask(repository, framework, agent, priority);

    logger.info(`Testing task created: ${result.taskId}`);

    res.status(201).json({
      message: 'Testing task created successfully',
      task: result
    });

  } catch (error) {
    logger.error('Failed to create testing task:', error);
    res.status(500).json({
      error: 'Failed to create testing task',
      details: error.message
    });
  }
});

module.exports = router;