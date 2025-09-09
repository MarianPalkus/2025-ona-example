const axios = require('axios');
const logger = require('../utils/logger');
const config = require('../config');

class GiteaService {
  constructor() {
    this.baseURL = config.gitea.url;
    this.token = config.gitea.token;
    this.client = axios.create({
      baseURL: `${this.baseURL}/api/v1`,
      headers: {
        'Authorization': `token ${this.token}`,
        'Content-Type': 'application/json'
      }
    });
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
      logger.error('Failed to create repository:', error.response?.data || error.message);
      throw error;
    }
  }

  async getRepository(owner, repo) {
    try {
      const response = await this.client.get(`/repos/${owner}/${repo}`);
      return response.data;
    } catch (error) {
      logger.error(`Failed to get repository ${owner}/${repo}:`, error.response?.data || error.message);
      throw error;
    }
  }

  async createIssue(options) {
    try {
      const response = await this.client.post(`/repos/${options.owner}/${options.repo}/issues`, {
        title: options.title,
        body: options.body,
        labels: options.labels || [],
        assignees: options.assignees || [],
        milestone: options.milestone
      });
      
      logger.info(`Created issue: ${response.data.html_url}`);
      return response.data;
    } catch (error) {
      logger.error('Failed to create issue:', error.response?.data || error.message);
      throw error;
    }
  }

  async getIssue(owner, repo, issueNumber) {
    try {
      const response = await this.client.get(`/repos/${owner}/${repo}/issues/${issueNumber}`);
      return response.data;
    } catch (error) {
      logger.error(`Failed to get issue ${owner}/${repo}#${issueNumber}:`, error.response?.data || error.message);
      throw error;
    }
  }

  async updateIssue(owner, repo, issueNumber, updates) {
    try {
      const response = await this.client.patch(`/repos/${owner}/${repo}/issues/${issueNumber}`, updates);
      logger.info(`Updated issue: ${response.data.html_url}`);
      return response.data;
    } catch (error) {
      logger.error(`Failed to update issue ${owner}/${repo}#${issueNumber}:`, error.response?.data || error.message);
      throw error;
    }
  }

  async closeIssue(owner, repo, issueNumber, comment = null) {
    try {
      if (comment) {
        await this.createIssueComment(owner, repo, issueNumber, comment);
      }
      
      const response = await this.updateIssue(owner, repo, issueNumber, { state: 'closed' });
      logger.info(`Closed issue: ${response.html_url}`);
      return response;
    } catch (error) {
      logger.error(`Failed to close issue ${owner}/${repo}#${issueNumber}:`, error.response?.data || error.message);
      throw error;
    }
  }

  async createIssueComment(owner, repo, issueNumber, body) {
    try {
      const response = await this.client.post(`/repos/${owner}/${repo}/issues/${issueNumber}/comments`, {
        body: body
      });
      
      logger.info(`Created comment on issue ${owner}/${repo}#${issueNumber}`);
      return response.data;
    } catch (error) {
      logger.error(`Failed to create comment on issue ${owner}/${repo}#${issueNumber}:`, error.response?.data || error.message);
      throw error;
    }
  }

  async getIssueComments(owner, repo, issueNumber) {
    try {
      const response = await this.client.get(`/repos/${owner}/${repo}/issues/${issueNumber}/comments`);
      return response.data;
    } catch (error) {
      logger.error(`Failed to get comments for issue ${owner}/${repo}#${issueNumber}:`, error.response?.data || error.message);
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
      logger.error(`Failed to list issues for ${owner}/${repo}:`, error.response?.data || error.message);
      throw error;
    }
  }

  async createWebhook(owner, repo, webhookUrl, events = ['issues', 'issue_comment', 'push']) {
    try {
      const response = await this.client.post(`/repos/${owner}/${repo}/hooks`, {
        type: 'gitea',
        config: {
          url: webhookUrl,
          content_type: 'json',
          secret: config.gitea.webhookSecret
        },
        events: events,
        active: true
      });
      
      logger.info(`Created webhook for ${owner}/${repo}: ${webhookUrl}`);
      return response.data;
    } catch (error) {
      logger.error(`Failed to create webhook for ${owner}/${repo}:`, error.response?.data || error.message);
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

      const response = await this.client.get('/search/issues', { params });
      return response.data;
    } catch (error) {
      logger.error('Failed to search issues:', error.response?.data || error.message);
      throw error;
    }
  }

  // Human-in-the-loop specific methods
  async createHumanInputIssue(repositoryInfo, agentContext) {
    const title = `[AI Agent] Human Input Required: ${agentContext.task}`;
    const body = this.formatHumanInputIssueBody(agentContext);
    
    return await this.createIssue({
      owner: repositoryInfo.owner,
      repo: repositoryInfo.name,
      title: title,
      body: body,
      labels: ['ai-agent', 'human-input-required', 'priority-high']
    });
  }

  formatHumanInputIssueBody(context) {
    return `## 🤖 AI Agent Request for Human Input

### Task Context
- **Current Task**: ${context.task}
- **Branch**: ${context.branch || 'main'}
- **Progress**: ${context.progress || 'In progress'}

### Current Situation
${context.situation}

### Question/Decision Required
${context.question}

### Available Options
${context.options ? context.options.map((opt, i) => `${i + 1}. ${opt}`).join('\n') : 'Please provide guidance in comments.'}

### Additional Context
${context.additionalContext || 'None provided'}

### Files Involved
${context.files ? context.files.map(f => `- \`${f}\``).join('\n') : 'None specified'}

---

**Instructions for Human:**
1. Review the context above
2. Provide your decision/input in a comment below
3. Use clear, specific language
4. The AI agent will automatically process your response

**Response Format:**
- For decisions: "DECISION: [your choice]"
- For code changes: "CODE: [your instructions]"
- For general guidance: "GUIDANCE: [your advice]"

*This issue was created automatically by an AI agent and will be monitored for responses.*`;
  }

  async parseHumanResponse(comments) {
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

module.exports = new GiteaService();