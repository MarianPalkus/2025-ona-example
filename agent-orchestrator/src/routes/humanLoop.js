const express = require('express');
const humanLoopService = require('../services/humanLoopService');
const logger = require('../utils/logger');

const router = express.Router();

// Get all pending human input requests
router.get('/requests', async (req, res) => {
  try {
    const {
      status = 'pending',
      taskId,
      agentId,
      limit = 50,
      offset = 0
    } = req.query;

    const requests = await humanLoopService.listPendingRequests();
    
    // Apply filters
    let filteredRequests = requests;
    
    if (status !== 'all') {
      filteredRequests = filteredRequests.filter(r => r.status === status);
    }
    
    if (taskId) {
      filteredRequests = filteredRequests.filter(r => r.taskId === taskId);
    }
    
    if (agentId) {
      filteredRequests = filteredRequests.filter(r => r.agentId === agentId);
    }

    // Sort by creation time (newest first)
    filteredRequests.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // Apply pagination
    const total = filteredRequests.length;
    const paginatedRequests = filteredRequests.slice(
      parseInt(offset), 
      parseInt(offset) + parseInt(limit)
    );

    res.json({
      requests: paginatedRequests,
      pagination: {
        total: total,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: parseInt(offset) + parseInt(limit) < total
      }
    });

  } catch (error) {
    logger.error('Failed to list human input requests:', error);
    res.status(500).json({
      error: 'Failed to retrieve human input requests',
      details: error.message
    });
  }
});

// Get specific human input request
router.get('/requests/:requestId', async (req, res) => {
  try {
    const { requestId } = req.params;

    const request = await humanLoopService.getPendingRequest(requestId);

    if (!request) {
      return res.status(404).json({
        error: 'Human input request not found'
      });
    }

    res.json(request);

  } catch (error) {
    logger.error(`Failed to get human input request ${req.params.requestId}:`, error);
    res.status(500).json({
      error: 'Failed to retrieve human input request',
      details: error.message
    });
  }
});

// Create human input request
router.post('/requests', async (req, res) => {
  try {
    const {
      taskId,
      agentId,
      question,
      situation,
      options,
      urgency = 'medium',
      additionalContext,
      files
    } = req.body;

    if (!taskId || !agentId) {
      return res.status(400).json({
        error: 'Task ID and Agent ID are required'
      });
    }

    if (!question && !situation) {
      return res.status(400).json({
        error: 'Either question or situation description is required'
      });
    }

    // Create mock task and context for the request
    const task = {
      id: taskId,
      description: req.body.taskDescription || 'Manual human input request',
      repository: req.body.repository || {}
    };

    const context = {
      agentId: agentId,
      question: question,
      situation: situation,
      options: options,
      urgency: urgency,
      additionalContext: additionalContext,
      files: files
    };

    const issue = await humanLoopService.requestHumanInput(task, context);

    logger.info(`Human input request created: ${issue.number}`);

    res.status(201).json({
      message: 'Human input request created successfully',
      issue: issue,
      taskId: taskId,
      agentId: agentId
    });

  } catch (error) {
    logger.error('Failed to create human input request:', error);
    res.status(500).json({
      error: 'Failed to create human input request',
      details: error.message
    });
  }
});

// Process human response
router.post('/responses', async (req, res) => {
  try {
    const {
      taskId,
      agentId,
      issueNumber,
      comment,
      repository
    } = req.body;

    if (!taskId || !agentId || !comment) {
      return res.status(400).json({
        error: 'Task ID, Agent ID, and comment are required'
      });
    }

    const responseData = {
      taskId: taskId,
      agentId: agentId,
      issueNumber: issueNumber,
      comment: comment,
      repository: repository
    };

    const parsedResponse = await humanLoopService.processHumanResponse(responseData);

    logger.info(`Human response processed for task ${taskId}`);

    res.json({
      message: 'Human response processed successfully',
      response: parsedResponse,
      taskId: taskId
    });

  } catch (error) {
    logger.error('Failed to process human response:', error);
    res.status(500).json({
      error: 'Failed to process human response',
      details: error.message
    });
  }
});

// Cancel human input request
router.delete('/requests/:requestId', async (req, res) => {
  try {
    const { requestId } = req.params;
    const { reason = 'cancelled by user' } = req.body;

    await humanLoopService.cancelPendingRequest(requestId, reason);

    logger.info(`Human input request cancelled: ${requestId}`);

    res.json({
      message: 'Human input request cancelled successfully',
      requestId: requestId,
      reason: reason
    });

  } catch (error) {
    logger.error(`Failed to cancel human input request ${req.params.requestId}:`, error);
    res.status(500).json({
      error: 'Failed to cancel human input request',
      details: error.message
    });
  }
});

// Get human loop metrics
router.get('/metrics', async (req, res) => {
  try {
    const metrics = await humanLoopService.getRequestMetrics();

    res.json({
      metrics: metrics,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Failed to get human loop metrics:', error);
    res.status(500).json({
      error: 'Failed to retrieve human loop metrics',
      details: error.message
    });
  }
});

// Close human input issue for completed task
router.post('/requests/:requestId/close', async (req, res) => {
  try {
    const { requestId } = req.params;
    const { resolution = 'completed' } = req.body;

    const request = await humanLoopService.getPendingRequest(requestId);
    if (!request) {
      return res.status(404).json({
        error: 'Human input request not found'
      });
    }

    await humanLoopService.closeHumanInputIssue(
      request.taskId,
      request.agentId,
      resolution
    );

    logger.info(`Human input issue closed for request ${requestId}`);

    res.json({
      message: 'Human input issue closed successfully',
      requestId: requestId,
      resolution: resolution
    });

  } catch (error) {
    logger.error(`Failed to close human input issue for request ${req.params.requestId}:`, error);
    res.status(500).json({
      error: 'Failed to close human input issue',
      details: error.message
    });
  }
});

// Get response format guide
router.get('/response-format', async (req, res) => {
  try {
    const responseFormat = {
      description: 'Structured response formats for human-in-the-loop communication',
      formats: {
        decision: {
          prefix: 'DECISION:',
          description: 'Make implementation decisions',
          example: 'DECISION: Use TypeScript for better type safety and developer experience'
        },
        code: {
          prefix: 'CODE:',
          description: 'Provide specific code guidance',
          example: 'CODE: Add error handling with try-catch blocks and proper logging'
        },
        guidance: {
          prefix: 'GUIDANCE:',
          description: 'Give general direction or advice',
          example: 'GUIDANCE: Focus on performance optimization before adding new features'
        },
        approval: {
          prefix: 'APPROVAL:',
          description: 'Approve or reject implementation plans',
          example: 'APPROVAL: Yes\nFEEDBACK: Looks good, but also add rate limiting'
        },
        question: {
          prefix: 'QUESTION:',
          description: 'Ask questions about the implementation',
          example: 'QUESTION: Should we use Redis or in-memory caching for this feature?'
        }
      },
      usage: {
        instructions: [
          'Use the appropriate prefix for your response type',
          'Be specific and clear in your guidance',
          'Provide reasoning when making decisions',
          'Include code examples when relevant'
        ],
        multipleResponses: 'You can use multiple response types in a single comment'
      }
    };

    res.json(responseFormat);

  } catch (error) {
    logger.error('Failed to get response format guide:', error);
    res.status(500).json({
      error: 'Failed to retrieve response format guide',
      details: error.message
    });
  }
});

// Cleanup old requests
router.post('/cleanup', async (req, res) => {
  try {
    const { maxAgeHours = 24 } = req.body;

    await humanLoopService.cleanupOldRequests(maxAgeHours);

    logger.info(`Cleaned up old human input requests (older than ${maxAgeHours} hours)`);

    res.json({
      message: 'Old human input requests cleaned up successfully',
      maxAgeHours: maxAgeHours
    });

  } catch (error) {
    logger.error('Failed to cleanup old human input requests:', error);
    res.status(500).json({
      error: 'Failed to cleanup old requests',
      details: error.message
    });
  }
});

// Get human loop statistics
router.get('/stats', async (req, res) => {
  try {
    const requests = await humanLoopService.listPendingRequests();
    
    const stats = {
      total: requests.length,
      byStatus: {},
      byUrgency: {},
      byAge: {
        lessThan1Hour: 0,
        lessThan6Hours: 0,
        lessThan24Hours: 0,
        moreThan24Hours: 0
      }
    };

    const now = new Date();
    
    requests.forEach(request => {
      // Count by status
      stats.byStatus[request.status] = (stats.byStatus[request.status] || 0) + 1;
      
      // Count by urgency
      const urgency = request.context?.urgency || 'medium';
      stats.byUrgency[urgency] = (stats.byUrgency[urgency] || 0) + 1;
      
      // Count by age
      const ageHours = (now - new Date(request.createdAt)) / (1000 * 60 * 60);
      if (ageHours < 1) {
        stats.byAge.lessThan1Hour++;
      } else if (ageHours < 6) {
        stats.byAge.lessThan6Hours++;
      } else if (ageHours < 24) {
        stats.byAge.lessThan24Hours++;
      } else {
        stats.byAge.moreThan24Hours++;
      }
    });

    res.json({
      statistics: stats,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Failed to get human loop statistics:', error);
    res.status(500).json({
      error: 'Failed to retrieve human loop statistics',
      details: error.message
    });
  }
});

module.exports = router;