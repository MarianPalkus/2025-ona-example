const express = require('express');
const devContainerService = require('../services/devContainerService');
const logger = require('../utils/logger');

const router = express.Router();

// List all active dev containers
router.get('/', async (req, res) => {
  try {
    const containers = await devContainerService.listActiveContainers();
    res.json({
      containers: containers,
      total: containers.length
    });
  } catch (error) {
    logger.error('Failed to list dev containers:', error);
    res.status(500).json({ error: 'Failed to retrieve dev containers' });
  }
});

// Get specific dev container status
router.get('/:containerId', async (req, res) => {
  try {
    const { containerId } = req.params;
    const status = await devContainerService.getContainerStatus(containerId);
    
    if (status.status === 'not_found') {
      return res.status(404).json({ error: 'Container not found' });
    }
    
    res.json(status);
  } catch (error) {
    logger.error('Failed to get container status:', error);
    res.status(500).json({ error: 'Failed to retrieve container status' });
  }
});

// Execute command in dev container
router.post('/:containerId/exec', async (req, res) => {
  try {
    const { containerId } = req.params;
    const { command, timeout } = req.body;
    
    if (!command) {
      return res.status(400).json({ error: 'Command is required' });
    }
    
    const result = await devContainerService.executeInContainer(containerId, command, {
      timeout: timeout || 60000
    });
    
    res.json(result);
  } catch (error) {
    logger.error('Failed to execute command in container:', error);
    res.status(500).json({ error: 'Failed to execute command' });
  }
});

// Clone repository in dev container
router.post('/:containerId/clone', async (req, res) => {
  try {
    const { containerId } = req.params;
    const { repositoryUrl, branch } = req.body;
    
    if (!repositoryUrl) {
      return res.status(400).json({ error: 'Repository URL is required' });
    }
    
    const repoPath = await devContainerService.cloneRepositoryInContainer(
      containerId,
      repositoryUrl,
      branch || 'main'
    );
    
    res.json({
      message: 'Repository cloned successfully',
      repositoryPath: repoPath,
      containerId: containerId
    });
  } catch (error) {
    logger.error('Failed to clone repository in container:', error);
    res.status(500).json({ error: 'Failed to clone repository' });
  }
});

// Install dependencies in dev container
router.post('/:containerId/install', async (req, res) => {
  try {
    const { containerId } = req.params;
    const { packageManager } = req.body;
    
    const result = await devContainerService.installDependencies(
      containerId,
      packageManager || 'npm'
    );
    
    res.json({
      message: 'Dependencies installation completed',
      result: result,
      containerId: containerId
    });
  } catch (error) {
    logger.error('Failed to install dependencies in container:', error);
    res.status(500).json({ error: 'Failed to install dependencies' });
  }
});

// Run tests in dev container
router.post('/:containerId/test', async (req, res) => {
  try {
    const { containerId } = req.params;
    const { testCommand } = req.body;
    
    const result = await devContainerService.runTests(
      containerId,
      testCommand || 'npm test'
    );
    
    res.json({
      message: 'Tests execution completed',
      result: result,
      containerId: containerId
    });
  } catch (error) {
    logger.error('Failed to run tests in container:', error);
    res.status(500).json({ error: 'Failed to run tests' });
  }
});

// Stop and cleanup dev container
router.delete('/:containerId', async (req, res) => {
  try {
    const { containerId } = req.params;
    
    await devContainerService.stopContainer(containerId);
    
    res.json({
      message: 'Container stopped and cleaned up',
      containerId: containerId
    });
  } catch (error) {
    logger.error('Failed to stop container:', error);
    res.status(500).json({ error: 'Failed to stop container' });
  }
});

// Cleanup stale containers
router.post('/cleanup', async (req, res) => {
  try {
    await devContainerService.cleanupStaleContainers();
    
    res.json({
      message: 'Stale containers cleanup completed'
    });
  } catch (error) {
    logger.error('Failed to cleanup stale containers:', error);
    res.status(500).json({ error: 'Failed to cleanup stale containers' });
  }
});

// Create dev container for testing
router.post('/create', async (req, res) => {
  try {
    const { repository, agentType } = req.body;
    
    if (!repository || !repository.url) {
      return res.status(400).json({ error: 'Repository URL is required' });
    }
    
    // Create mock agent and task for testing
    const mockAgent = {
      id: `test-agent-${Date.now()}`,
      type: agentType || 'claude',
      context: {}
    };
    
    const mockTask = {
      id: `test-task-${Date.now()}`,
      repository: repository
    };
    
    const containerId = await devContainerService.createAgentContainer(mockAgent, mockTask);
    
    res.json({
      message: 'Dev container created successfully',
      containerId: containerId,
      agentId: mockAgent.id,
      taskId: mockTask.id
    });
  } catch (error) {
    logger.error('Failed to create dev container:', error);
    res.status(500).json({ error: 'Failed to create dev container' });
  }
});

module.exports = router;