const express = require('express');
const specializedAgents = require('../services/specializedAgents');
const logger = require('../utils/logger');

const router = express.Router();

// Get all available specialists
router.get('/', (req, res) => {
  try {
    const specialists = specializedAgents.getAvailableSpecialists();
    res.json({
      specialists: specialists,
      total: specialists.length
    });
  } catch (error) {
    logger.error('Failed to get specialists:', error);
    res.status(500).json({ error: 'Failed to retrieve specialists' });
  }
});

// Get specialist details by ID
router.get('/:specialistId', (req, res) => {
  try {
    const specialists = specializedAgents.getAvailableSpecialists();
    const specialist = specialists.find(s => s.id === req.params.specialistId);
    
    if (!specialist) {
      return res.status(404).json({ error: 'Specialist not found' });
    }
    
    res.json(specialist);
  } catch (error) {
    logger.error('Failed to get specialist:', error);
    res.status(500).json({ error: 'Failed to retrieve specialist' });
  }
});

// Manually trigger specialist review for a PR
router.post('/review', async (req, res) => {
  try {
    const { repository, pullRequestNumber, specialists } = req.body;
    
    if (!repository || !pullRequestNumber) {
      return res.status(400).json({ 
        error: 'Repository and pullRequestNumber are required' 
      });
    }
    
    // Get PR details from Gitea
    const giteaClient = require('../../mcp-server/src/services/giteaClient');
    const pullRequest = await giteaClient.getPullRequest(
      repository.owner,
      repository.name,
      pullRequestNumber
    );
    
    // Trigger review
    const reviewPromise = specializedAgents.reviewPullRequest(pullRequest, repository);
    
    // Don't wait for completion, return immediately
    res.json({
      message: 'Specialist review triggered',
      pullRequest: pullRequestNumber,
      repository: `${repository.owner}/${repository.name}`,
      specialists: specialists || 'auto-detected'
    });
    
    // Handle review completion asynchronously
    reviewPromise.catch(error => {
      logger.error('Manual specialist review failed:', error);
    });
    
  } catch (error) {
    logger.error('Failed to trigger specialist review:', error);
    res.status(500).json({ error: 'Failed to trigger review' });
  }
});

// Enable specialists for a repository
router.post('/repositories/:owner/:repo/enable', async (req, res) => {
  try {
    const { owner, repo } = req.params;
    const { specialists } = req.body;
    
    if (!specialists || !Array.isArray(specialists)) {
      return res.status(400).json({ 
        error: 'Specialists array is required' 
      });
    }
    
    const repositoryId = `${owner}/${repo}`;
    await specializedAgents.enableSpecialistForRepository(repositoryId, specialists);
    
    res.json({
      message: 'Specialists enabled for repository',
      repository: repositoryId,
      specialists: specialists
    });
    
  } catch (error) {
    logger.error('Failed to enable specialists:', error);
    res.status(500).json({ error: 'Failed to enable specialists' });
  }
});

// Disable specialists for a repository
router.post('/repositories/:owner/:repo/disable', async (req, res) => {
  try {
    const { owner, repo } = req.params;
    const { specialists } = req.body;
    
    if (!specialists || !Array.isArray(specialists)) {
      return res.status(400).json({ 
        error: 'Specialists array is required' 
      });
    }
    
    const repositoryId = `${owner}/${repo}`;
    await specializedAgents.disableSpecialistForRepository(repositoryId, specialists);
    
    res.json({
      message: 'Specialists disabled for repository',
      repository: repositoryId,
      specialists: specialists
    });
    
  } catch (error) {
    logger.error('Failed to disable specialists:', error);
    res.status(500).json({ error: 'Failed to disable specialists' });
  }
});

// Get specialist review history
router.get('/reviews/:owner/:repo', async (req, res) => {
  try {
    const { owner, repo } = req.params;
    const { limit = 10, offset = 0 } = req.query;
    
    // This would typically query a database for review history
    // For now, return a placeholder response
    res.json({
      repository: `${owner}/${repo}`,
      reviews: [],
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total: 0
      }
    });
    
  } catch (error) {
    logger.error('Failed to get review history:', error);
    res.status(500).json({ error: 'Failed to retrieve review history' });
  }
});

// Get specialist performance metrics
router.get('/metrics', async (req, res) => {
  try {
    const { timeframe = '30d' } = req.query;
    
    // This would typically query metrics from a database
    // For now, return placeholder metrics
    const specialists = specializedAgents.getAvailableSpecialists();
    const metrics = specialists.map(specialist => ({
      id: specialist.id,
      name: specialist.name,
      reviewsCompleted: Math.floor(Math.random() * 50),
      averageReviewTime: Math.floor(Math.random() * 30) + 5, // 5-35 minutes
      issuesFound: Math.floor(Math.random() * 20),
      approvalRate: (Math.random() * 0.4 + 0.6).toFixed(2) // 60-100%
    }));
    
    res.json({
      timeframe: timeframe,
      specialists: metrics,
      summary: {
        totalReviews: metrics.reduce((sum, s) => sum + s.reviewsCompleted, 0),
        averageReviewTime: Math.floor(metrics.reduce((sum, s) => sum + s.averageReviewTime, 0) / metrics.length),
        totalIssuesFound: metrics.reduce((sum, s) => sum + s.issuesFound, 0)
      }
    });
    
  } catch (error) {
    logger.error('Failed to get specialist metrics:', error);
    res.status(500).json({ error: 'Failed to retrieve metrics' });
  }
});

module.exports = router;