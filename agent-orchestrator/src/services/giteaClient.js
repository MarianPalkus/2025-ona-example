const axios = require('axios');
const logger = require('../utils/logger');

class GiteaClient {
  constructor() {
    this.baseURL = process.env.GITEA_URL || 'http://gitea:3000';
    this.token = process.env.GITEA_TOKEN;
    this.connected = false;
    
    if (!this.token) {
      logger.warn('GITEA_TOKEN not provided, some operations may fail');
    }
    
    this.client = axios.create({
      baseURL: `${this.baseURL}/api/v1`,
      timeout: 30000,
      headers: {
        'Authorization': this.token ? `token ${this.token}` : undefined,
        'Content-Type': 'application/json'
      }
    });

    // Add request/response interceptors for logging
    this.client.interceptors.request.use(
      (config) => {
        logger.debug(`Gitea Request: ${config.method?.toUpperCase()} ${config.url}`);
        return config;
      },
      (error) => {
        logger.error('Gitea Request Error:', error);
        return Promise.reject(error);
      }
    );

    this.client.interceptors.response.use(
      (response) => {
        logger.debug(`Gitea Response: ${response.status} ${response.config.url}`);
        return response;
      },
      (error) => {
        logger.error(`Gitea Response Error: ${error.response?.status} ${error.config?.url}`, error.message);
        return Promise.reject(error);
      }
    );
  }

  async connect() {
    try {
      const response = await this.client.get('/version');
      this.connected = response.status === 200;
      logger.info(`Connected to Gitea server: ${this.baseURL}`);
      return this.connected;
    } catch (error) {
      this.connected = false;
      logger.error(`Failed to connect to Gitea server: ${this.baseURL}`, error.message);
      throw error;
    }
  }

  async disconnect() {
    this.connected = false;
    logger.info('Disconnected from Gitea server');
  }

  isConnected() {
    return this.connected;
  }

  // Repository operations
  async getRepository(owner, repo) {
    try {
      const response = await this.client.get(`/repos/${owner}/${repo}`);
      return response.data;
    } catch (error) {
      logger.error(`Failed to get repository ${owner}/${repo}:`, error);
      throw error;
    }
  }

  async createRepository(options) {
    try {
      const response = await this.client.post('/user/repos', {
        name: options.name,
        description: options.description || '',
        private: options.private || false,
        auto_init: options.autoInit || true,
        default_branch: options.defaultBranch || 'main'
      });
      
      logger.info(`Created repository: ${response.data.full_name}`);
      return response.data;
    } catch (error) {
      logger.error('Failed to create repository:', error);
      throw error;
    }
  }

  // Issue operations
  async createIssue(owner, repo, title, body, labels = [], assignees = []) {
    try {
      const response = await this.client.post(`/repos/${owner}/${repo}/issues`, {
        title: title,
        body: body,
        labels: labels,
        assignees: assignees
      });
      
      logger.info(`Created issue: ${owner}/${repo}#${response.data.number}`);
      return response.data;
    } catch (error) {
      logger.error(`Failed to create issue in ${owner}/${repo}:`, error);
      throw error;
    }
  }

  async getIssue(owner, repo, issueNumber) {
    try {
      const response = await this.client.get(`/repos/${owner}/${repo}/issues/${issueNumber}`);
      return response.data;
    } catch (error) {
      logger.error(`Failed to get issue ${owner}/${repo}#${issueNumber}:`, error);
      throw error;
    }
  }

  async updateIssue(owner, repo, issueNumber, updates) {
    try {
      const response = await this.client.patch(`/repos/${owner}/${repo}/issues/${issueNumber}`, updates);
      logger.info(`Updated issue: ${owner}/${repo}#${issueNumber}`);
      return response.data;
    } catch (error) {
      logger.error(`Failed to update issue ${owner}/${repo}#${issueNumber}:`, error);
      throw error;
    }
  }

  async closeIssue(owner, repo, issueNumber, comment = null) {
    try {
      if (comment) {
        await this.createIssueComment(owner, repo, issueNumber, comment);
      }
      
      const response = await this.updateIssue(owner, repo, issueNumber, { state: 'closed' });
      logger.info(`Closed issue: ${owner}/${repo}#${issueNumber}`);
      return response;
    } catch (error) {
      logger.error(`Failed to close issue ${owner}/${repo}#${issueNumber}:`, error);
      throw error;
    }
  }

  async listIssues(owner, repo, options = {}) {
    try {
      const params = {
        state: options.state || 'open',
        labels: options.labels ? options.labels.join(',') : undefined,
        sort: options.sort || 'created',
        direction: options.direction || 'desc',
        page: options.page || 1,
        limit: options.limit || 30
      };

      const response = await this.client.get(`/repos/${owner}/${repo}/issues`, { params });
      return response.data;
    } catch (error) {
      logger.error(`Failed to list issues for ${owner}/${repo}:`, error);
      throw error;
    }
  }

  // Issue comment operations
  async createIssueComment(owner, repo, issueNumber, body) {
    try {
      const response = await this.client.post(`/repos/${owner}/${repo}/issues/${issueNumber}/comments`, {
        body: body
      });
      
      logger.info(`Created comment on issue ${owner}/${repo}#${issueNumber}`);
      return response.data;
    } catch (error) {
      logger.error(`Failed to create comment on issue ${owner}/${repo}#${issueNumber}:`, error);
      throw error;
    }
  }

  async getIssueComments(owner, repo, issueNumber) {
    try {
      const response = await this.client.get(`/repos/${owner}/${repo}/issues/${issueNumber}/comments`);
      return response.data;
    } catch (error) {
      logger.error(`Failed to get comments for issue ${owner}/${repo}#${issueNumber}:`, error);
      throw error;
    }
  }

  async updateIssueComment(owner, repo, commentId, body) {
    try {
      const response = await this.client.patch(`/repos/${owner}/${repo}/issues/comments/${commentId}`, {
        body: body
      });
      
      logger.info(`Updated comment ${commentId} in ${owner}/${repo}`);
      return response.data;
    } catch (error) {
      logger.error(`Failed to update comment ${commentId} in ${owner}/${repo}:`, error);
      throw error;
    }
  }

  async deleteIssueComment(owner, repo, commentId) {
    try {
      await this.client.delete(`/repos/${owner}/${repo}/issues/comments/${commentId}`);
      logger.info(`Deleted comment ${commentId} in ${owner}/${repo}`);
    } catch (error) {
      logger.error(`Failed to delete comment ${commentId} in ${owner}/${repo}:`, error);
      throw error;
    }
  }

  // Pull request operations
  async createPullRequest(owner, repo, title, body, head, base, labels = []) {
    try {
      const response = await this.client.post(`/repos/${owner}/${repo}/pulls`, {
        title: title,
        body: body,
        head: head,
        base: base
      });
      
      // Add labels if provided
      if (labels.length > 0) {
        await this.addLabelsToPullRequest(owner, repo, response.data.number, labels);
      }
      
      logger.info(`Created pull request: ${owner}/${repo}#${response.data.number}`);
      return response.data;
    } catch (error) {
      logger.error(`Failed to create pull request in ${owner}/${repo}:`, error);
      throw error;
    }
  }

  async getPullRequest(owner, repo, prNumber) {
    try {
      const response = await this.client.get(`/repos/${owner}/${repo}/pulls/${prNumber}`);
      return response.data;
    } catch (error) {
      logger.error(`Failed to get pull request ${owner}/${repo}#${prNumber}:`, error);
      throw error;
    }
  }

  async getPullRequestFiles(owner, repo, prNumber) {
    try {
      const response = await this.client.get(`/repos/${owner}/${repo}/pulls/${prNumber}/files`);
      return response.data;
    } catch (error) {
      logger.error(`Failed to get pull request files ${owner}/${repo}#${prNumber}:`, error);
      throw error;
    }
  }

  async getPullRequestDiff(owner, repo, prNumber) {
    try {
      const response = await this.client.get(`/repos/${owner}/${repo}/pulls/${prNumber}.diff`);
      return response.data;
    } catch (error) {
      logger.error(`Failed to get pull request diff ${owner}/${repo}#${prNumber}:`, error);
      throw error;
    }
  }

  async mergePullRequest(owner, repo, prNumber, mergeMethod = 'merge') {
    try {
      const response = await this.client.post(`/repos/${owner}/${repo}/pulls/${prNumber}/merge`, {
        Do: mergeMethod
      });
      
      logger.info(`Merged pull request: ${owner}/${repo}#${prNumber}`);
      return response.data;
    } catch (error) {
      logger.error(`Failed to merge pull request ${owner}/${repo}#${prNumber}:`, error);
      throw error;
    }
  }

  async createPullRequestComment(owner, repo, prNumber, body) {
    try {
      const response = await this.client.post(`/repos/${owner}/${repo}/pulls/${prNumber}/reviews`, {
        body: body,
        event: 'COMMENT'
      });
      
      logger.info(`Created comment on pull request ${owner}/${repo}#${prNumber}`);
      return response.data;
    } catch (error) {
      logger.error(`Failed to create comment on pull request ${owner}/${repo}#${prNumber}:`, error);
      throw error;
    }
  }

  // Label operations
  async createLabel(owner, repo, labelData) {
    try {
      const response = await this.client.post(`/repos/${owner}/${repo}/labels`, {
        name: labelData.name,
        color: labelData.color,
        description: labelData.description || ''
      });
      
      logger.info(`Created label: ${labelData.name} in ${owner}/${repo}`);
      return response.data;
    } catch (error) {
      // Label might already exist
      if (error.response?.status === 409) {
        logger.debug(`Label ${labelData.name} already exists in ${owner}/${repo}`);
        return null;
      }
      logger.error(`Failed to create label ${labelData.name} in ${owner}/${repo}:`, error);
      throw error;
    }
  }

  async addLabelToIssue(owner, repo, issueNumber, labelName) {
    try {
      const response = await this.client.post(`/repos/${owner}/${repo}/issues/${issueNumber}/labels`, {
        labels: [labelName]
      });
      
      logger.info(`Added label ${labelName} to issue ${owner}/${repo}#${issueNumber}`);
      return response.data;
    } catch (error) {
      logger.error(`Failed to add label ${labelName} to issue ${owner}/${repo}#${issueNumber}:`, error);
      throw error;
    }
  }

  async addLabelsToPullRequest(owner, repo, prNumber, labels) {
    try {
      const response = await this.client.post(`/repos/${owner}/${repo}/issues/${prNumber}/labels`, {
        labels: labels
      });
      
      logger.info(`Added labels ${labels.join(', ')} to pull request ${owner}/${repo}#${prNumber}`);
      return response.data;
    } catch (error) {
      logger.error(`Failed to add labels to pull request ${owner}/${repo}#${prNumber}:`, error);
      throw error;
    }
  }

  async removeLabelFromIssue(owner, repo, issueNumber, labelName) {
    try {
      await this.client.delete(`/repos/${owner}/${repo}/issues/${issueNumber}/labels/${labelName}`);
      logger.info(`Removed label ${labelName} from issue ${owner}/${repo}#${issueNumber}`);
    } catch (error) {
      logger.error(`Failed to remove label ${labelName} from issue ${owner}/${repo}#${issueNumber}:`, error);
      throw error;
    }
  }

  // Webhook operations
  async createWebhook(owner, repo, webhookUrl, events = ['issues', 'issue_comment', 'push', 'pull_request']) {
    try {
      const response = await this.client.post(`/repos/${owner}/${repo}/hooks`, {
        type: 'gitea',
        config: {
          url: webhookUrl,
          content_type: 'json',
          secret: process.env.GITEA_WEBHOOK_SECRET || ''
        },
        events: events,
        active: true
      });
      
      logger.info(`Created webhook for ${owner}/${repo}: ${webhookUrl}`);
      return response.data;
    } catch (error) {
      logger.error(`Failed to create webhook for ${owner}/${repo}:`, error);
      throw error;
    }
  }

  async listWebhooks(owner, repo) {
    try {
      const response = await this.client.get(`/repos/${owner}/${repo}/hooks`);
      return response.data;
    } catch (error) {
      logger.error(`Failed to list webhooks for ${owner}/${repo}:`, error);
      throw error;
    }
  }

  async deleteWebhook(owner, repo, webhookId) {
    try {
      await this.client.delete(`/repos/${owner}/${repo}/hooks/${webhookId}`);
      logger.info(`Deleted webhook ${webhookId} for ${owner}/${repo}`);
    } catch (error) {
      logger.error(`Failed to delete webhook ${webhookId} for ${owner}/${repo}:`, error);
      throw error;
    }
  }

  // Search operations
  async searchRepositories(query, options = {}) {
    try {
      const params = {
        q: query,
        sort: options.sort || 'updated',
        order: options.order || 'desc',
        page: options.page || 1,
        limit: options.limit || 30
      };

      const response = await this.client.get('/repos/search', { params });
      return response.data;
    } catch (error) {
      logger.error('Failed to search repositories:', error);
      throw error;
    }
  }

  async searchIssues(query, options = {}) {
    try {
      const params = {
        q: query,
        type: 'issues',
        sort: options.sort || 'updated',
        order: options.order || 'desc',
        page: options.page || 1,
        limit: options.limit || 30
      };

      const response = await this.client.get('/repos/issues/search', { params });
      return response.data;
    } catch (error) {
      logger.error('Failed to search issues:', error);
      throw error;
    }
  }

  // User operations
  async getCurrentUser() {
    try {
      const response = await this.client.get('/user');
      return response.data;
    } catch (error) {
      logger.error('Failed to get current user:', error);
      throw error;
    }
  }

  async getUser(username) {
    try {
      const response = await this.client.get(`/users/${username}`);
      return response.data;
    } catch (error) {
      logger.error(`Failed to get user ${username}:`, error);
      throw error;
    }
  }

  // Utility methods
  async ping() {
    try {
      const response = await this.client.get('/version');
      return response.status === 200;
    } catch (error) {
      return false;
    }
  }

  async getServerInfo() {
    try {
      const response = await this.client.get('/version');
      return response.data;
    } catch (error) {
      logger.error('Failed to get server info:', error);
      throw error;
    }
  }

  // Human response parsing (for human-in-the-loop)
  parseHumanResponse(comments) {
    const responses = [];
    
    for (const comment of comments) {
      const body = comment.body.trim();
      
      if (body.startsWith('DECISION:')) {
        responses.push({
          type: 'decision',
          content: body.substring(9).trim(),
          author: comment.user.login,
          timestamp: comment.created_at
        });
      } else if (body.startsWith('CODE:')) {
        responses.push({
          type: 'code',
          content: body.substring(5).trim(),
          author: comment.user.login,
          timestamp: comment.created_at
        });
      } else if (body.startsWith('GUIDANCE:')) {
        responses.push({
          type: 'guidance',
          content: body.substring(9).trim(),
          author: comment.user.login,
          timestamp: comment.created_at
        });
      } else if (body.startsWith('APPROVAL:')) {
        const approval = body.substring(9).trim();
        responses.push({
          type: 'approval',
          content: approval,
          approved: approval.toLowerCase().includes('yes'),
          author: comment.user.login,
          timestamp: comment.created_at
        });
      } else {
        responses.push({
          type: 'general',
          content: body,
          author: comment.user.login,
          timestamp: comment.created_at
        });
      }
    }
    
    return responses;
  }
}

module.exports = new GiteaClient();