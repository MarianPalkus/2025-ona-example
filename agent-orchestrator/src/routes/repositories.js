const express = require('express');
const mcpClient = require('../services/mcpClient');
const giteaClient = require('../services/giteaClient');
const logger = require('../utils/logger');

const router = express.Router();

// Get repository information
router.get('/:owner/:repo', async (req, res) => {
  try {
    const { owner, repo } = req.params;

    const repository = await giteaClient.getRepository(owner, repo);

    res.json({
      repository: repository
    });

  } catch (error) {
    logger.error(`Failed to get repository ${req.params.owner}/${req.params.repo}:`, error);
    res.status(500).json({
      error: 'Failed to retrieve repository',
      details: error.message
    });
  }
});

// Clone repository
router.post('/clone', async (req, res) => {
  try {
    const {
      url,
      branch = 'main',
      targetPath
    } = req.body;

    if (!url) {
      return res.status(400).json({
        error: 'Repository URL is required'
      });
    }

    const clonedPath = await mcpClient.cloneRepository(url, branch, targetPath);

    logger.info(`Repository cloned: ${url} to ${clonedPath}`);

    res.json({
      message: 'Repository cloned successfully',
      url: url,
      branch: branch,
      path: clonedPath
    });

  } catch (error) {
    logger.error('Failed to clone repository:', error);
    res.status(500).json({
      error: 'Failed to clone repository',
      details: error.message
    });
  }
});

// Analyze repository structure
router.post('/analyze', async (req, res) => {
  try {
    const {
      repositoryPath,
      url,
      branch = 'main'
    } = req.body;

    let pathToAnalyze = repositoryPath;

    // If URL is provided, clone first
    if (url && !repositoryPath) {
      pathToAnalyze = await mcpClient.cloneRepository(url, branch);
    }

    if (!pathToAnalyze) {
      return res.status(400).json({
        error: 'Repository path or URL is required'
      });
    }

    const analysis = await mcpClient.analyzeRepository(pathToAnalyze);

    logger.info(`Repository analyzed: ${pathToAnalyze}`);

    res.json({
      message: 'Repository analyzed successfully',
      path: pathToAnalyze,
      analysis: analysis
    });

  } catch (error) {
    logger.error('Failed to analyze repository:', error);
    res.status(500).json({
      error: 'Failed to analyze repository',
      details: error.message
    });
  }
});

// Create repository in Gitea
router.post('/', async (req, res) => {
  try {
    const {
      name,
      description,
      private: isPrivate = false,
      autoInit = true,
      defaultBranch = 'main'
    } = req.body;

    if (!name) {
      return res.status(400).json({
        error: 'Repository name is required'
      });
    }

    const repository = await giteaClient.createRepository({
      name: name,
      description: description,
      private: isPrivate,
      autoInit: autoInit,
      defaultBranch: defaultBranch
    });

    logger.info(`Repository created: ${repository.full_name}`);

    res.status(201).json({
      message: 'Repository created successfully',
      repository: repository
    });

  } catch (error) {
    logger.error('Failed to create repository:', error);
    res.status(500).json({
      error: 'Failed to create repository',
      details: error.message
    });
  }
});

// Search repositories
router.get('/search', async (req, res) => {
  try {
    const {
      q: query,
      sort = 'updated',
      order = 'desc',
      page = 1,
      limit = 30
    } = req.query;

    if (!query) {
      return res.status(400).json({
        error: 'Search query is required'
      });
    }

    const results = await giteaClient.searchRepositories(query, {
      sort: sort,
      order: order,
      page: parseInt(page),
      limit: parseInt(limit)
    });

    res.json({
      query: query,
      results: results,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit)
      }
    });

  } catch (error) {
    logger.error('Failed to search repositories:', error);
    res.status(500).json({
      error: 'Failed to search repositories',
      details: error.message
    });
  }
});

// Get repository branches
router.get('/:owner/:repo/branches', async (req, res) => {
  try {
    const { owner, repo } = req.params;

    // This would typically call a Gitea API endpoint for branches
    // For now, return a placeholder response
    res.json({
      repository: `${owner}/${repo}`,
      branches: [
        {
          name: 'main',
          commit: {
            sha: 'abc123',
            message: 'Initial commit'
          },
          protected: true
        }
      ]
    });

  } catch (error) {
    logger.error(`Failed to get branches for ${req.params.owner}/${req.params.repo}:`, error);
    res.status(500).json({
      error: 'Failed to retrieve repository branches',
      details: error.message
    });
  }
});

// Get repository files
router.get('/:owner/:repo/files', async (req, res) => {
  try {
    const { owner, repo } = req.params;
    const { path = '', ref = 'main' } = req.query;

    // This would typically call a Gitea API endpoint for repository contents
    // For now, return a placeholder response
    res.json({
      repository: `${owner}/${repo}`,
      path: path,
      ref: ref,
      files: []
    });

  } catch (error) {
    logger.error(`Failed to get files for ${req.params.owner}/${req.params.repo}:`, error);
    res.status(500).json({
      error: 'Failed to retrieve repository files',
      details: error.message
    });
  }
});

// Get repository issues
router.get('/:owner/:repo/issues', async (req, res) => {
  try {
    const { owner, repo } = req.params;
    const {
      state = 'open',
      labels,
      sort = 'created',
      direction = 'desc',
      page = 1,
      limit = 30
    } = req.query;

    const options = {
      state: state,
      labels: labels ? labels.split(',') : undefined,
      sort: sort,
      direction: direction,
      page: parseInt(page),
      limit: parseInt(limit)
    };

    const issues = await giteaClient.listIssues(owner, repo, options);

    res.json({
      repository: `${owner}/${repo}`,
      issues: issues,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit)
      }
    });

  } catch (error) {
    logger.error(`Failed to get issues for ${req.params.owner}/${req.params.repo}:`, error);
    res.status(500).json({
      error: 'Failed to retrieve repository issues',
      details: error.message
    });
  }
});

// Create issue in repository
router.post('/:owner/:repo/issues', async (req, res) => {
  try {
    const { owner, repo } = req.params;
    const {
      title,
      body,
      labels = [],
      assignees = []
    } = req.body;

    if (!title) {
      return res.status(400).json({
        error: 'Issue title is required'
      });
    }

    const issue = await giteaClient.createIssue(owner, repo, title, body, labels, assignees);

    logger.info(`Issue created: ${owner}/${repo}#${issue.number}`);

    res.status(201).json({
      message: 'Issue created successfully',
      issue: issue
    });

  } catch (error) {
    logger.error(`Failed to create issue in ${req.params.owner}/${req.params.repo}:`, error);
    res.status(500).json({
      error: 'Failed to create issue',
      details: error.message
    });
  }
});

// Get repository pull requests
router.get('/:owner/:repo/pulls', async (req, res) => {
  try {
    const { owner, repo } = req.params;
    const {
      state = 'open',
      sort = 'created',
      direction = 'desc',
      page = 1,
      limit = 30
    } = req.query;

    // This would typically call a Gitea API endpoint for pull requests
    // For now, return a placeholder response
    res.json({
      repository: `${owner}/${repo}`,
      pullRequests: [],
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit)
      }
    });

  } catch (error) {
    logger.error(`Failed to get pull requests for ${req.params.owner}/${req.params.repo}:`, error);
    res.status(500).json({
      error: 'Failed to retrieve repository pull requests',
      details: error.message
    });
  }
});

// Create pull request in repository
router.post('/:owner/:repo/pulls', async (req, res) => {
  try {
    const { owner, repo } = req.params;
    const {
      title,
      body,
      head,
      base = 'main',
      labels = []
    } = req.body;

    if (!title || !head) {
      return res.status(400).json({
        error: 'Pull request title and head branch are required'
      });
    }

    const pullRequest = await giteaClient.createPullRequest(
      owner, repo, title, body, head, base, labels
    );

    logger.info(`Pull request created: ${owner}/${repo}#${pullRequest.number}`);

    res.status(201).json({
      message: 'Pull request created successfully',
      pullRequest: pullRequest
    });

  } catch (error) {
    logger.error(`Failed to create pull request in ${req.params.owner}/${req.params.repo}:`, error);
    res.status(500).json({
      error: 'Failed to create pull request',
      details: error.message
    });
  }
});

// Get repository webhooks
router.get('/:owner/:repo/webhooks', async (req, res) => {
  try {
    const { owner, repo } = req.params;

    const webhooks = await giteaClient.listWebhooks(owner, repo);

    res.json({
      repository: `${owner}/${repo}`,
      webhooks: webhooks
    });

  } catch (error) {
    logger.error(`Failed to get webhooks for ${req.params.owner}/${req.params.repo}:`, error);
    res.status(500).json({
      error: 'Failed to retrieve repository webhooks',
      details: error.message
    });
  }
});

// Create webhook for repository
router.post('/:owner/:repo/webhooks', async (req, res) => {
  try {
    const { owner, repo } = req.params;
    const {
      url: webhookUrl,
      events = ['issues', 'issue_comment', 'push', 'pull_request']
    } = req.body;

    if (!webhookUrl) {
      return res.status(400).json({
        error: 'Webhook URL is required'
      });
    }

    const webhook = await giteaClient.createWebhook(owner, repo, webhookUrl, events);

    logger.info(`Webhook created for ${owner}/${repo}: ${webhookUrl}`);

    res.status(201).json({
      message: 'Webhook created successfully',
      webhook: webhook
    });

  } catch (error) {
    logger.error(`Failed to create webhook for ${req.params.owner}/${req.params.repo}:`, error);
    res.status(500).json({
      error: 'Failed to create webhook',
      details: error.message
    });
  }
});

// Get repository statistics
router.get('/:owner/:repo/stats', async (req, res) => {
  try {
    const { owner, repo } = req.params;

    const repository = await giteaClient.getRepository(owner, repo);
    
    // Get additional statistics
    const issues = await giteaClient.listIssues(owner, repo, { limit: 1 });
    
    const stats = {
      repository: {
        name: repository.name,
        fullName: repository.full_name,
        description: repository.description,
        language: repository.language,
        size: repository.size,
        createdAt: repository.created_at,
        updatedAt: repository.updated_at
      },
      counts: {
        stars: repository.stars_count || 0,
        forks: repository.forks_count || 0,
        watchers: repository.watchers_count || 0,
        openIssues: repository.open_issues_count || 0
      },
      settings: {
        private: repository.private,
        fork: repository.fork,
        archived: repository.archived,
        defaultBranch: repository.default_branch
      }
    };

    res.json({
      repository: `${owner}/${repo}`,
      statistics: stats,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error(`Failed to get statistics for ${req.params.owner}/${req.params.repo}:`, error);
    res.status(500).json({
      error: 'Failed to retrieve repository statistics',
      details: error.message
    });
  }
});

module.exports = router;