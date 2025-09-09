const express = require('express');
const crypto = require('crypto');
const logger = require('../utils/logger');
const giteaService = require('../services/giteaService');
const config = require('../config');

const router = express.Router();

// Webhook signature verification
function verifyWebhookSignature(payload, signature, secret) {
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(signature, 'hex'),
    Buffer.from(expectedSignature, 'hex')
  );
}

// Main webhook handler for Gitea
router.post('/gitea', async (req, res) => {
  try {
    const signature = req.headers['x-gitea-signature'];
    const event = req.headers['x-gitea-event'];
    const payload = JSON.stringify(req.body);

    // Verify webhook signature
    if (!verifyWebhookSignature(payload, signature, config.gitea.webhookSecret)) {
      logger.warn('Invalid webhook signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    logger.info(`Received Gitea webhook: ${event}`);

    // Handle different webhook events
    switch (event) {
      case 'issues':
        await handleIssueEvent(req.body);
        break;
      case 'issue_comment':
        await handleIssueCommentEvent(req.body);
        break;
      case 'push':
        await handlePushEvent(req.body);
        break;
      case 'pull_request':
        await handlePullRequestEvent(req.body);
        break;
      default:
        logger.info(`Unhandled webhook event: ${event}`);
    }

    res.status(200).json({ status: 'processed' });
  } catch (error) {
    logger.error('Webhook processing error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Handle issue events (create, edit, close, etc.)
async function handleIssueEvent(payload) {
  const { action, issue, repository } = payload;
  
  if (action === 'opened') {
    await processNewIssue(issue, repository);
  } else if (action === 'labeled') {
    await processIssueLabelChange(issue, repository);
  } else if (action === 'assigned') {
    await processIssueAssignment(issue, repository);
  }
}

// Process new issues for AI agent task creation
async function processNewIssue(issue, repository) {
  try {
    const taskRequest = parseIssueForTaskCreation(issue);
    
    if (taskRequest) {
      logger.info(`Creating AI agent task from issue #${issue.number}`);
      
      // Create task via agent orchestrator
      const task = await createAgentTask(taskRequest, issue, repository);
      
      // Add comment to issue with task details
      await giteaService.createIssueComment(
        repository.owner.login,
        repository.name,
        issue.number,
        formatTaskCreatedComment(task)
      );
      
      // Add task tracking label
      await addTaskTrackingLabels(issue, repository, task);
    }
  } catch (error) {
    logger.error('Error processing new issue for task creation:', error);
  }
}

// Parse issue content to determine if it's an AI agent task request
function parseIssueForTaskCreation(issue) {
  const title = issue.title.toLowerCase();
  const body = issue.body || '';
  const labels = issue.labels.map(label => label.name.toLowerCase());
  
  // Check for AI agent task indicators
  const isAITask = 
    title.includes('[ai-task]') ||
    title.includes('[agent]') ||
    labels.includes('ai-agent-task') ||
    labels.includes('ai-task') ||
    labels.includes('agent-task');
  
  if (!isAITask) {
    return null;
  }
  
  // Determine agent type from labels or content
  let agentType = 'claude'; // default
  if (labels.includes('openai') || labels.includes('gpt')) {
    agentType = 'openai';
  } else if (labels.includes('claude') || labels.includes('anthropic')) {
    agentType = 'claude';
  }
  
  // Determine priority from labels
  let priority = 'medium';
  if (labels.includes('priority-high') || labels.includes('urgent')) {
    priority = 'high';
  } else if (labels.includes('priority-low')) {
    priority = 'low';
  }
  
  // Extract repository info from issue body
  const repoInfo = extractRepositoryInfo(body, issue);
  
  // Clean title (remove AI task markers)
  const cleanTitle = issue.title
    .replace(/\[ai-task\]/gi, '')
    .replace(/\[agent\]/gi, '')
    .trim();
  
  return {
    description: cleanTitle,
    additionalContext: body,
    agent: agentType,
    priority: priority,
    repository: repoInfo,
    sourceIssue: {
      number: issue.number,
      url: issue.html_url,
      title: issue.title
    }
  };
}

// Extract repository information from issue body
function extractRepositoryInfo(body, issue) {
  // Look for repository URL in issue body
  const repoUrlMatch = body.match(/(?:repository|repo):\s*(https?:\/\/[^\s]+)/i);
  const branchMatch = body.match(/(?:branch):\s*([^\s\n]+)/i);
  
  return {
    url: repoUrlMatch ? repoUrlMatch[1] : `${issue.repository.clone_url}`,
    branch: branchMatch ? branchMatch[1] : 'main'
  };
}

// Create agent task via orchestrator API
async function createAgentTask(taskRequest, issue, repository) {
  const axios = require('axios');
  
  const taskData = {
    repository: taskRequest.repository,
    description: taskRequest.description,
    agent: taskRequest.agent,
    priority: taskRequest.priority,
    additionalContext: taskRequest.additionalContext,
    metadata: {
      sourceType: 'gitea_issue',
      sourceIssue: taskRequest.sourceIssue,
      repository: {
        owner: repository.owner.login,
        name: repository.name,
        fullName: repository.full_name
      }
    }
  };
  
  try {
    const response = await axios.post(
      `${config.agentOrchestrator.url}/tasks`,
      taskData,
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000
      }
    );
    
    return response.data;
  } catch (error) {
    logger.error('Failed to create agent task:', error);
    throw error;
  }
}

// Format comment for task creation confirmation
function formatTaskCreatedComment(task) {
  return `## 🤖 AI Agent Task Created

**Task ID**: \`${task.id}\`
**Agent**: ${task.agent}
**Priority**: ${task.priority}
**Status**: ${task.status}

### Task Details
${task.description}

### Repository
- **URL**: ${task.repository.url}
- **Branch**: ${task.repository.branch}

### Monitoring
- **Task Status**: [View Details](http://localhost:9000/tasks/${task.id})
- **Agent Dashboard**: [Open Dashboard](http://localhost:4000/tasks/${task.id})

---
*This task was automatically created from this issue. The AI agent will begin work shortly and may request human input through additional comments or new issues.*

**Available Commands:**
- \`@agent pause\` - Pause the current task
- \`@agent resume\` - Resume a paused task  
- \`@agent status\` - Get current task status
- \`@agent cancel\` - Cancel the task`;
}

// Add task tracking labels to issue
async function addTaskTrackingLabels(issue, repository, task) {
  try {
    const labels = [
      'ai-agent-active',
      `agent-${task.agent}`,
      `priority-${task.priority}`,
      `task-${task.id}`
    ];
    
    // Add labels to issue
    for (const label of labels) {
      try {
        await giteaService.addLabelToIssue(
          repository.owner.login,
          repository.name,
          issue.number,
          label
        );
      } catch (error) {
        // Label might not exist, create it
        await giteaService.createLabel(
          repository.owner.login,
          repository.name,
          {
            name: label,
            color: getLabelColor(label),
            description: getLabelDescription(label)
          }
        );
        
        // Try adding again
        await giteaService.addLabelToIssue(
          repository.owner.login,
          repository.name,
          issue.number,
          label
        );
      }
    }
  } catch (error) {
    logger.error('Failed to add task tracking labels:', error);
  }
}

// Get label colors for different label types
function getLabelColor(label) {
  if (label.startsWith('agent-')) return '#0366d6';
  if (label.startsWith('priority-high')) return '#d73a49';
  if (label.startsWith('priority-medium')) return '#f66a0a';
  if (label.startsWith('priority-low')) return '#28a745';
  if (label.startsWith('task-')) return '#6f42c1';
  if (label === 'ai-agent-active') return '#0366d6';
  return '#586069';
}

// Get label descriptions
function getLabelDescription(label) {
  if (label.startsWith('agent-')) return `Task assigned to ${label.split('-')[1]} agent`;
  if (label.startsWith('priority-')) return `Task priority: ${label.split('-')[1]}`;
  if (label.startsWith('task-')) return `Agent task ID: ${label.split('-')[1]}`;
  if (label === 'ai-agent-active') return 'AI agent is actively working on this issue';
  return '';
}

// Handle issue comment events (for human responses and commands)
async function handleIssueCommentEvent(payload) {
  const { action, comment, issue, repository } = payload;
  
  if (action === 'created') {
    await processIssueComment(comment, issue, repository);
  }
}

// Process issue comments for agent commands and human responses
async function processIssueComment(comment, issue, repository) {
  const commentBody = comment.body.trim();
  const isBot = comment.user.login === 'ai-agent-bot'; // Skip bot comments
  
  if (isBot) return;
  
  // Check for agent commands
  if (commentBody.startsWith('@agent ')) {
    await processAgentCommand(commentBody, comment, issue, repository);
    return;
  }
  
  // Check if this is a human response to an AI agent request
  const labels = issue.labels.map(l => l.name);
  const isAgentIssue = labels.some(l => 
    l.includes('ai-agent') || l.includes('human-input-required')
  );
  
  if (isAgentIssue) {
    await processHumanResponse(comment, issue, repository);
  }
}

// Process agent commands (@agent pause, @agent status, etc.)
async function processAgentCommand(commentBody, comment, issue, repository) {
  const command = commentBody.replace('@agent ', '').toLowerCase().trim();
  const taskId = extractTaskIdFromIssue(issue);
  
  if (!taskId) {
    await giteaService.createIssueComment(
      repository.owner.login,
      repository.name,
      issue.number,
      '❌ No active agent task found for this issue.'
    );
    return;
  }
  
  try {
    const axios = require('axios');
    let response;
    
    switch (command) {
      case 'pause':
        response = await axios.post(`${config.agentOrchestrator.url}/tasks/${taskId}/pause`);
        await giteaService.createIssueComment(
          repository.owner.login,
          repository.name,
          issue.number,
          '⏸️ Agent task has been paused.'
        );
        break;
        
      case 'resume':
        response = await axios.post(`${config.agentOrchestrator.url}/tasks/${taskId}/resume`);
        await giteaService.createIssueComment(
          repository.owner.login,
          repository.name,
          issue.number,
          '▶️ Agent task has been resumed.'
        );
        break;
        
      case 'status':
        response = await axios.get(`${config.agentOrchestrator.url}/tasks/${taskId}`);
        const task = response.data;
        await giteaService.createIssueComment(
          repository.owner.login,
          repository.name,
          issue.number,
          formatTaskStatusComment(task)
        );
        break;
        
      case 'cancel':
        response = await axios.delete(`${config.agentOrchestrator.url}/tasks/${taskId}`);
        await giteaService.createIssueComment(
          repository.owner.login,
          repository.name,
          issue.number,
          '🛑 Agent task has been cancelled.'
        );
        break;
        
      default:
        await giteaService.createIssueComment(
          repository.owner.login,
          repository.name,
          issue.number,
          `❓ Unknown command: \`${command}\`\n\nAvailable commands: pause, resume, status, cancel`
        );
    }
  } catch (error) {
    logger.error('Failed to process agent command:', error);
    await giteaService.createIssueComment(
      repository.owner.login,
      repository.name,
      issue.number,
      `❌ Failed to execute command: ${error.message}`
    );
  }
}

// Extract task ID from issue labels or comments
function extractTaskIdFromIssue(issue) {
  const taskLabel = issue.labels.find(l => l.name.startsWith('task-'));
  return taskLabel ? taskLabel.name.replace('task-', '') : null;
}

// Format task status comment
function formatTaskStatusComment(task) {
  return `## 📊 Agent Task Status

**Task ID**: \`${task.id}\`
**Status**: ${task.status}
**Agent**: ${task.agent}
**Progress**: ${task.progress || 'N/A'}%
**Started**: ${new Date(task.createdAt).toLocaleString()}
**Last Update**: ${new Date(task.updatedAt).toLocaleString()}

### Current Activity
${task.currentActivity || 'No current activity'}

### Recent Actions
${task.recentActions ? task.recentActions.map(a => `- ${a}`).join('\n') : 'No recent actions'}

---
[View Full Details](http://localhost:9000/tasks/${task.id})`;
}

// Process human responses to agent requests
async function processHumanResponse(comment, issue, repository) {
  const taskId = extractTaskIdFromIssue(issue);
  
  if (!taskId) return;
  
  try {
    const axios = require('axios');
    
    // Parse human response
    const response = giteaService.parseHumanResponse([comment]);
    
    if (response.length > 0) {
      // Send human response to agent orchestrator
      await axios.post(
        `${config.agentOrchestrator.url}/tasks/${taskId}/human-response`,
        {
          response: response[0],
          source: {
            type: 'gitea_comment',
            issueNumber: issue.number,
            commentId: comment.id,
            author: comment.user.login
          }
        }
      );
      
      // Add confirmation comment
      await giteaService.createIssueComment(
        repository.owner.login,
        repository.name,
        issue.number,
        `✅ Human response received and forwarded to AI agent. The agent will continue with your guidance.`
      );
      
      logger.info(`Human response processed for task ${taskId}`);
    }
  } catch (error) {
    logger.error('Failed to process human response:', error);
  }
}

// Handle push events (optional: auto-create tasks for certain patterns)
async function handlePushEvent(payload) {
  // Could implement auto-task creation based on commit messages
  // e.g., commits with "[ai-task]" prefix
}

// Handle pull request events
async function handlePullRequestEvent(payload) {
  const { action, pull_request, repository } = payload;
  
  if (action === 'opened' || action === 'synchronize') {
    // Trigger specialized agent reviews
    await triggerSpecializedReviews(pull_request, repository);
  } else if (action === 'closed' && pull_request.merged) {
    // Handle successful merge
    await handlePullRequestMerged(pull_request, repository);
  }
}

// Trigger specialized agent reviews for new/updated PRs
async function triggerSpecializedReviews(pullRequest, repository) {
  try {
    logger.info(`Triggering specialized reviews for PR #${pullRequest.number}`);
    
    // Import specialized agents service
    const specializedAgents = require('../../agent-orchestrator/src/services/specializedAgents');
    
    // Start specialized reviews asynchronously
    specializedAgents.reviewPullRequest(pullRequest, {
      owner: repository.owner.login,
      name: repository.name,
      fullName: repository.full_name
    }).catch(error => {
      logger.error('Specialized review failed:', error);
    });
    
  } catch (error) {
    logger.error('Failed to trigger specialized reviews:', error);
  }
}

// Handle successful PR merge
async function handlePullRequestMerged(pullRequest, repository) {
  try {
    // Find related task and update status
    const taskId = extractTaskIdFromPR(pullRequest);
    
    if (taskId) {
      const axios = require('axios');
      const config = require('../config');
      
      await axios.patch(`${config.agentOrchestrator.url}/tasks/${taskId}`, {
        status: 'completed',
        completedAt: new Date().toISOString(),
        pullRequest: {
          number: pullRequest.number,
          merged: true,
          mergedAt: pullRequest.merged_at
        }
      });
      
      logger.info(`Task ${taskId} marked as completed after PR merge`);
    }
  } catch (error) {
    logger.error('Failed to handle PR merge:', error);
  }
}

// Extract task ID from PR description or branch name
function extractTaskIdFromPR(pullRequest) {
  // Look for task ID in PR body
  const bodyMatch = pullRequest.body?.match(/(?:task|resolves):\s*#?([a-zA-Z0-9-]+)/i);
  if (bodyMatch) return bodyMatch[1];
  
  // Look for task ID in branch name
  const branchMatch = pullRequest.head?.ref?.match(/task-([a-zA-Z0-9-]+)/);
  if (branchMatch) return branchMatch[1];
  
  return null;
}

module.exports = router;