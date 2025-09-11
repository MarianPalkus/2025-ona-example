const logger = require('../utils/logger');
const giteaClient = require('./giteaClient');
const mcpClient = require('./mcpClient');

class HumanLoopService {
  constructor() {
    this.pendingRequests = new Map();
    this.responseHandlers = new Map();
    this.initialized = false;
  }

  async initialize() {
    try {
      logger.info('Initializing Human Loop Service...');
      this.initialized = true;
      logger.info('Human Loop Service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Human Loop Service:', error);
      throw error;
    }
  }

  async requestHumanInput(task, context) {
    try {
      logger.info(`Requesting human input for task ${task.id}`);
      
      // Create human input request issue in Gitea
      const issue = await this.createHumanInputIssue(task, context);
      
      // Store pending request
      const requestId = `${task.id}_${Date.now()}`;
      this.pendingRequests.set(requestId, {
        id: requestId,
        taskId: task.id,
        agentId: context.agentId,
        issue: issue,
        context: context,
        createdAt: new Date(),
        status: 'pending'
      });
      
      logger.info(`Human input requested for task ${task.id}: Issue #${issue.number}`);
      return issue;
      
    } catch (error) {
      logger.error(`Failed to request human input for task ${task.id}:`, error);
      throw error;
    }
  }

  async createHumanInputIssue(task, context) {
    const repositoryInfo = this.extractRepositoryInfo(task);
    const issueTitle = `[AI Agent] Human Input Required: ${context.question || task.description}`;
    const issueBody = this.formatHumanInputIssueBody(task, context);
    
    try {
      const issue = await mcpClient.createGiteaIssue(
        repositoryInfo.owner,
        repositoryInfo.name,
        issueTitle,
        issueBody,
        ['ai-agent', 'human-input-required', `priority-${context.urgency || 'medium'}`]
      );
      
      return issue;
    } catch (error) {
      logger.error('Failed to create human input issue:', error);
      throw error;
    }
  }

  extractRepositoryInfo(task) {
    if (task.repository && task.repository.url) {
      const urlParts = task.repository.url.replace('.git', '').split('/');
      return {
        owner: urlParts[urlParts.length - 2],
        name: urlParts[urlParts.length - 1]
      };
    }
    
    // Fallback to metadata if available
    if (task.metadata && task.metadata.repository) {
      return {
        owner: task.metadata.repository.owner,
        name: task.metadata.repository.name
      };
    }
    
    throw new Error('Unable to extract repository information from task');
  }

  formatHumanInputIssueBody(task, context) {
    return `## 🤖 AI Agent Request for Human Input

### Task Context
- **Task ID**: \`${task.id}\`
- **Agent ID**: \`${context.agentId}\`
- **Current Task**: ${task.description}
- **Repository**: ${task.repository?.url || 'N/A'}
- **Branch**: ${task.repository?.branch || 'main'}
- **Progress**: ${context.progress || 'In progress'}

### Current Situation
${context.situation || context.currentMessage || 'The AI agent needs human guidance to proceed.'}

### Question/Decision Required
${context.question || 'Please provide guidance on how to proceed.'}

${context.options ? `### Available Options
${context.options.map((opt, i) => `${i + 1}. ${opt}`).join('\n')}` : ''}

${context.additionalContext ? `### Additional Context
${context.additionalContext}` : ''}

${context.files ? `### Files Involved
${context.files.map(f => `- \`${f}\``).join('\n')}` : ''}

${context.actionResults ? `### Recent Actions
${context.actionResults.map(r => `- ${r.action?.type || 'Unknown'}: ${r.status}`).join('\n')}` : ''}

---

## 📝 How to Respond

Please provide your input using one of these structured formats:

### For Decisions
\`\`\`
DECISION: [Your choice and reasoning]
\`\`\`

### For Code Guidance
\`\`\`
CODE: [Specific implementation instructions]
\`\`\`

### For General Guidance
\`\`\`
GUIDANCE: [Your advice or direction]
\`\`\`

### For Approval/Rejection
\`\`\`
APPROVAL: Yes/No
FEEDBACK: [Any specific feedback]
\`\`\`

### For Questions
\`\`\`
QUESTION: [Your question about the implementation]
\`\`\`

---

**Instructions:**
1. Review the context and situation above
2. Provide your response using the structured format
3. Be specific and clear in your guidance
4. The AI agent will automatically process your response and continue

**Urgency**: ${this.getUrgencyEmoji(context.urgency)} ${context.urgency || 'Medium'}

---
*This issue was created automatically by an AI agent. The agent is waiting for your response to continue with the task.*`;
  }

  getUrgencyEmoji(urgency) {
    switch (urgency?.toLowerCase()) {
      case 'high': return '🔴';
      case 'medium': return '🟡';
      case 'low': return '🟢';
      default: return '🟡';
    }
  }

  async processHumanResponse(responseData) {
    try {
      const { taskId, agentId, issueNumber, comment, repository } = responseData;
      
      logger.info(`Processing human response for task ${taskId}`);
      
      // Find pending request
      const pendingRequest = this.findPendingRequest(taskId, agentId);
      if (!pendingRequest) {
        logger.warn(`No pending request found for task ${taskId}, agent ${agentId}`);
        return null;
      }
      
      // Parse human response
      const parsedResponse = this.parseHumanResponse(comment.body);
      
      // Update request status
      pendingRequest.status = 'responded';
      pendingRequest.response = parsedResponse;
      pendingRequest.respondedAt = new Date();
      
      // Notify agent service
      const agentService = require('./agentService');
      await agentService.processHumanResponse(agentId, {
        type: parsedResponse.type,
        content: parsedResponse.content,
        taskId: taskId,
        issueNumber: issueNumber,
        originalRequest: pendingRequest
      });
      
      // Add confirmation comment to issue
      await this.addConfirmationComment(repository, issueNumber, parsedResponse);
      
      // Remove from pending requests
      this.pendingRequests.delete(pendingRequest.id);
      
      logger.info(`Human response processed successfully for task ${taskId}`);
      return parsedResponse;
      
    } catch (error) {
      logger.error('Failed to process human response:', error);
      throw error;
    }
  }

  findPendingRequest(taskId, agentId) {
    for (const [requestId, request] of this.pendingRequests) {
      if (request.taskId === taskId && request.agentId === agentId && request.status === 'pending') {
        return request;
      }
    }
    return null;
  }

  parseHumanResponse(responseText) {
    const text = responseText.trim();
    
    // Check for structured responses
    if (text.includes('DECISION:')) {
      return {
        type: 'decision',
        content: this.extractStructuredContent(text, 'DECISION:'),
        raw: text
      };
    }
    
    if (text.includes('CODE:')) {
      return {
        type: 'code',
        content: this.extractStructuredContent(text, 'CODE:'),
        raw: text
      };
    }
    
    if (text.includes('GUIDANCE:')) {
      return {
        type: 'guidance',
        content: this.extractStructuredContent(text, 'GUIDANCE:'),
        raw: text
      };
    }
    
    if (text.includes('APPROVAL:')) {
      const approval = this.extractStructuredContent(text, 'APPROVAL:');
      const feedback = this.extractStructuredContent(text, 'FEEDBACK:');
      
      return {
        type: 'approval',
        content: approval,
        feedback: feedback,
        approved: approval.toLowerCase().includes('yes'),
        raw: text
      };
    }
    
    if (text.includes('QUESTION:')) {
      return {
        type: 'question',
        content: this.extractStructuredContent(text, 'QUESTION:'),
        raw: text
      };
    }
    
    // Fallback to general response
    return {
      type: 'general',
      content: text,
      raw: text
    };
  }

  extractStructuredContent(text, prefix) {
    const lines = text.split('\n');
    let content = '';
    let capturing = false;
    
    for (const line of lines) {
      if (line.trim().startsWith(prefix)) {
        content = line.substring(line.indexOf(prefix) + prefix.length).trim();
        capturing = true;
      } else if (capturing && line.trim().match(/^[A-Z]+:/)) {
        // Stop capturing when we hit another structured prefix
        break;
      } else if (capturing && line.trim()) {
        content += ' ' + line.trim();
      }
    }
    
    return content.trim();
  }

  async addConfirmationComment(repository, issueNumber, parsedResponse) {
    try {
      const confirmationText = `## ✅ Human Response Received

**Response Type**: ${parsedResponse.type.toUpperCase()}
**Content**: ${parsedResponse.content}

The AI agent has received your response and will continue with the task based on your guidance.

---
*This confirmation was generated automatically.*`;

      await mcpClient.addGiteaComment(
        repository.owner,
        repository.name,
        issueNumber,
        confirmationText
      );
      
    } catch (error) {
      logger.error('Failed to add confirmation comment:', error);
      // Don't throw - this is not critical
    }
  }

  async closeHumanInputIssue(taskId, agentId, resolution = 'completed') {
    try {
      const pendingRequest = this.findPendingRequest(taskId, agentId);
      if (!pendingRequest) {
        logger.warn(`No pending request found to close for task ${taskId}`);
        return;
      }
      
      const repositoryInfo = this.extractRepositoryInfo({ 
        repository: pendingRequest.context.repository || {},
        metadata: pendingRequest.context.metadata || {}
      });
      
      // Add closing comment
      const closingComment = `## 🎯 Task ${resolution.toUpperCase()}

The AI agent has ${resolution} the task. This human input request is now closed.

**Final Status**: ${resolution}
**Completed At**: ${new Date().toISOString()}

Thank you for your guidance!

---
*This issue was closed automatically by the AI agent.*`;

      await mcpClient.addGiteaComment(
        repositoryInfo.owner,
        repositoryInfo.name,
        pendingRequest.issue.number,
        closingComment
      );
      
      // Remove from pending requests
      this.pendingRequests.delete(pendingRequest.id);
      
      logger.info(`Closed human input issue for task ${taskId}: ${resolution}`);
      
    } catch (error) {
      logger.error(`Failed to close human input issue for task ${taskId}:`, error);
      // Don't throw - this is not critical
    }
  }

  async listPendingRequests() {
    return Array.from(this.pendingRequests.values());
  }

  async getPendingRequest(requestId) {
    return this.pendingRequests.get(requestId);
  }

  async cancelPendingRequest(requestId, reason = 'cancelled') {
    const request = this.pendingRequests.get(requestId);
    if (!request) {
      throw new Error(`Pending request not found: ${requestId}`);
    }
    
    request.status = 'cancelled';
    request.cancelledAt = new Date();
    request.cancellationReason = reason;
    
    // Add cancellation comment to issue
    try {
      const repositoryInfo = this.extractRepositoryInfo({
        repository: request.context.repository || {},
        metadata: request.context.metadata || {}
      });
      
      const cancellationComment = `## ❌ Request Cancelled

This human input request has been cancelled.

**Reason**: ${reason}
**Cancelled At**: ${new Date().toISOString()}

---
*This issue was cancelled automatically.*`;

      await mcpClient.addGiteaComment(
        repositoryInfo.owner,
        repositoryInfo.name,
        request.issue.number,
        cancellationComment
      );
      
    } catch (error) {
      logger.error('Failed to add cancellation comment:', error);
    }
    
    // Remove from pending requests
    this.pendingRequests.delete(requestId);
    
    logger.info(`Cancelled pending request ${requestId}: ${reason}`);
  }

  async getRequestMetrics() {
    const requests = Array.from(this.pendingRequests.values());
    
    return {
      total: requests.length,
      pending: requests.filter(r => r.status === 'pending').length,
      responded: requests.filter(r => r.status === 'responded').length,
      cancelled: requests.filter(r => r.status === 'cancelled').length,
      averageResponseTime: this.calculateAverageResponseTime(requests),
      oldestPending: this.getOldestPendingRequest(requests)
    };
  }

  calculateAverageResponseTime(requests) {
    const respondedRequests = requests.filter(r => r.status === 'responded' && r.respondedAt);
    
    if (respondedRequests.length === 0) {
      return null;
    }
    
    const totalTime = respondedRequests.reduce((sum, request) => {
      return sum + (request.respondedAt.getTime() - request.createdAt.getTime());
    }, 0);
    
    return Math.round(totalTime / respondedRequests.length / 1000 / 60); // minutes
  }

  getOldestPendingRequest(requests) {
    const pendingRequests = requests.filter(r => r.status === 'pending');
    
    if (pendingRequests.length === 0) {
      return null;
    }
    
    return pendingRequests.reduce((oldest, request) => {
      return request.createdAt < oldest.createdAt ? request : oldest;
    });
  }

  // Cleanup old requests periodically
  async cleanupOldRequests(maxAgeHours = 24) {
    const cutoffTime = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);
    const requestsToCleanup = [];
    
    for (const [requestId, request] of this.pendingRequests) {
      if (request.createdAt < cutoffTime && request.status === 'pending') {
        requestsToCleanup.push(requestId);
      }
    }
    
    for (const requestId of requestsToCleanup) {
      try {
        await this.cancelPendingRequest(requestId, 'timeout - no response received');
      } catch (error) {
        logger.error(`Failed to cleanup old request ${requestId}:`, error);
      }
    }
    
    if (requestsToCleanup.length > 0) {
      logger.info(`Cleaned up ${requestsToCleanup.length} old human input requests`);
    }
  }
}

module.exports = new HumanLoopService();