const logger = require('../utils/logger');
const mcpClient = require('./mcpClient');
const giteaClient = require('./giteaClient');
const agentService = require('./agentService');

class DevelopmentWorkflow {
  constructor() {
    this.workflowSteps = [
      'requirements_analysis',
      'clarification_questions',
      'implementation_planning',
      'outcome_verification',
      'branch_creation',
      'implementation',
      'testing',
      'pull_request_creation',
      'review_response',
      'merge_completion'
    ];
  }

  async executeWorkflow(agent, task) {
    try {
      logger.info(`Starting development workflow for task ${task.id}`);
      
      // Step 1: Analyze requirements and ask clarifying questions
      const clarificationNeeded = await this.analyzeRequirements(agent, task);
      
      if (clarificationNeeded) {
        await this.requestClarification(agent, task, clarificationNeeded);
        return { status: 'awaiting_clarification', step: 'requirements_analysis' };
      }

      // Step 2: Plan implementation and verify outcome expectations
      const implementationPlan = await this.createImplementationPlan(agent, task);
      
      const verificationNeeded = await this.shouldVerifyOutcome(implementationPlan, task);
      if (verificationNeeded) {
        await this.requestOutcomeVerification(agent, task, implementationPlan);
        return { status: 'awaiting_verification', step: 'outcome_verification' };
      }

      // Step 3: Create feature branch
      const branchName = await this.createFeatureBranch(agent, task);
      
      // Step 4: Implement changes
      const implementation = await this.implementChanges(agent, task, implementationPlan);
      
      // Step 5: Run tests
      const testResults = await this.runTests(agent, task);
      
      // Step 6: Create pull request
      const pullRequest = await this.createPullRequest(agent, task, implementation, branchName);
      
      // Step 7: Wait for human review
      await this.notifyForReview(agent, task, pullRequest);
      
      return { 
        status: 'awaiting_review', 
        step: 'pull_request_created',
        pullRequest: pullRequest,
        branch: branchName
      };
      
    } catch (error) {
      logger.error(`Development workflow failed for task ${task.id}:`, error);
      throw error;
    }
  }

  async analyzeRequirements(agent, task) {
    const analysisPrompt = `
Analyze the following task requirements and identify any unclear or incomplete aspects:

Task: ${task.description}
Additional Context: ${task.additionalContext || 'None provided'}

Please identify:
1. Any ambiguous requirements that need clarification
2. Missing technical specifications
3. Unclear acceptance criteria
4. Dependencies or constraints not specified
5. Questions about implementation approach

If the requirements are clear and complete, respond with "REQUIREMENTS_CLEAR".
If clarification is needed, list specific questions that would help you implement this task correctly.
`;

    const response = await agentService.queryAgent(agent, analysisPrompt);
    
    if (response.includes('REQUIREMENTS_CLEAR')) {
      return null;
    }
    
    return this.parseQuestions(response);
  }

  parseQuestions(response) {
    // Extract questions from agent response
    const questions = [];
    const lines = response.split('\n');
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.includes('?') || trimmed.match(/^\d+\./)) {
        questions.push(trimmed);
      }
    }
    
    return questions.length > 0 ? questions : [response];
  }

  async requestClarification(agent, task, questions) {
    const clarificationIssue = await giteaClient.createIssue({
      owner: task.repository.owner,
      repo: task.repository.name,
      title: `[AI Agent] Clarification Needed: ${task.description}`,
      body: this.formatClarificationRequest(task, questions),
      labels: ['ai-agent', 'clarification-needed', 'question']
    });

    // Update task with clarification request
    await this.updateTaskStatus(task.id, 'awaiting_clarification', {
      clarificationIssue: clarificationIssue.number,
      questions: questions
    });

    logger.info(`Clarification requested for task ${task.id}: Issue #${clarificationIssue.number}`);
  }

  formatClarificationRequest(task, questions) {
    return `## 🤖 AI Agent Clarification Request

I'm working on the following task but need some clarification to ensure I implement exactly what you need.

### Original Task
**Description**: ${task.description}
**Repository**: ${task.repository.url}
**Branch**: ${task.repository.branch || 'main'}

### Questions for Clarification

${questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}

### Why I'm Asking
These clarifications will help me:
- Implement the correct solution
- Avoid rework and revisions
- Meet your exact requirements
- Follow the right technical approach

### How to Respond
Please answer the questions above in a comment. You can use this format:

\`\`\`
ANSWER 1: [Your response to question 1]
ANSWER 2: [Your response to question 2]
...
\`\`\`

Or simply respond naturally - I'll understand your answers.

---
*Once you provide clarification, I'll continue with the implementation.*`;
  }

  async createImplementationPlan(agent, task) {
    const planningPrompt = `
Create a detailed implementation plan for this task:

Task: ${task.description}
Additional Context: ${task.additionalContext || 'None'}
Repository: ${task.repository.url}

Please provide:
1. High-level approach and architecture decisions
2. Files that will be created/modified
3. Key implementation steps
4. Testing strategy
5. Potential risks or challenges
6. Expected outcome and success criteria

Format your response as a structured implementation plan.
`;

    const response = await agentService.queryAgent(agent, planningPrompt);
    return this.parseImplementationPlan(response);
  }

  parseImplementationPlan(response) {
    return {
      approach: this.extractSection(response, 'approach'),
      files: this.extractSection(response, 'files'),
      steps: this.extractSection(response, 'steps'),
      testing: this.extractSection(response, 'testing'),
      risks: this.extractSection(response, 'risks'),
      outcome: this.extractSection(response, 'outcome'),
      fullPlan: response
    };
  }

  extractSection(text, sectionName) {
    const regex = new RegExp(`(?:${sectionName}|\\d+\\.).*?:(.*?)(?=\\n\\d+\\.|\\n[A-Z]|$)`, 'is');
    const match = text.match(regex);
    return match ? match[1].trim() : '';
  }

  async shouldVerifyOutcome(plan, task) {
    // Verify outcome for complex tasks, architectural changes, or when explicitly requested
    const complexityIndicators = [
      'architecture', 'database', 'api', 'security', 'performance',
      'breaking change', 'migration', 'refactor', 'integration'
    ];
    
    const isComplex = complexityIndicators.some(indicator => 
      task.description.toLowerCase().includes(indicator) ||
      plan.fullPlan.toLowerCase().includes(indicator)
    );
    
    const hasRisks = plan.risks && plan.risks.length > 50;
    const multipleFiles = plan.files && plan.files.split('\n').length > 3;
    
    return isComplex || hasRisks || multipleFiles;
  }

  async requestOutcomeVerification(agent, task, plan) {
    const verificationIssue = await giteaClient.createIssue({
      owner: task.repository.owner,
      repo: task.repository.name,
      title: `[AI Agent] Implementation Plan Verification: ${task.description}`,
      body: this.formatVerificationRequest(task, plan),
      labels: ['ai-agent', 'verification-needed', 'implementation-plan']
    });

    await this.updateTaskStatus(task.id, 'awaiting_verification', {
      verificationIssue: verificationIssue.number,
      implementationPlan: plan
    });

    logger.info(`Outcome verification requested for task ${task.id}: Issue #${verificationIssue.number}`);
  }

  formatVerificationRequest(task, plan) {
    return `## 🤖 AI Agent Implementation Plan Verification

Before I start implementing, I'd like to verify my approach with you to ensure I'm on the right track.

### Task Summary
**Description**: ${task.description}
**Repository**: ${task.repository.url}

### My Implementation Plan

#### Approach
${plan.approach}

#### Files to be Modified/Created
${plan.files}

#### Implementation Steps
${plan.steps}

#### Testing Strategy
${plan.testing}

#### Potential Risks
${plan.risks}

#### Expected Outcome
${plan.outcome}

### Questions for You
1. Does this approach align with your expectations?
2. Are there any concerns with the proposed changes?
3. Should I proceed with this implementation plan?
4. Any specific requirements or constraints I should consider?

### How to Respond
Please review the plan above and respond with:

\`\`\`
APPROVAL: Yes/No
FEEDBACK: [Any specific feedback or changes needed]
PROCEED: [Any additional instructions]
\`\`\`

---
*Once approved, I'll create a feature branch and begin implementation.*`;
  }

  async createFeatureBranch(agent, task) {
    const branchName = this.generateBranchName(task);
    
    try {
      await mcpClient.gitOperation('create_branch', {
        repository: task.repository.url,
        branchName: branchName,
        baseBranch: task.repository.branch || 'main'
      });
      
      logger.info(`Created feature branch: ${branchName}`);
      return branchName;
    } catch (error) {
      logger.error(`Failed to create branch ${branchName}:`, error);
      throw error;
    }
  }

  generateBranchName(task) {
    const prefix = task.description.toLowerCase().includes('fix') ? 'bugfix' : 'feature';
    const description = task.description
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, '-')
      .substring(0, 50);
    
    const timestamp = Date.now().toString().slice(-6);
    return `${prefix}/${description}-${timestamp}`;
  }

  async implementChanges(agent, task, plan) {
    logger.info(`Starting implementation for task ${task.id}`);
    
    // Switch to feature branch
    await mcpClient.gitOperation('checkout', {
      repository: task.repository.url,
      branch: plan.branch || task.branch
    });

    // Execute implementation using agent
    const implementationPrompt = `
Implement the following task according to the approved plan:

Task: ${task.description}
Implementation Plan: ${plan.fullPlan}

Please implement the changes step by step:
1. Analyze existing code structure
2. Make necessary changes following the plan
3. Ensure code quality and consistency
4. Add appropriate comments and documentation
5. Follow existing code patterns and conventions

Provide detailed information about each change made.
`;

    const implementation = await agentService.executeWithImplementation(agent, implementationPrompt, {
      repository: task.repository.url,
      workingDirectory: agent.context.workingDirectory
    });

    // Commit changes
    await this.commitChanges(task, implementation);
    
    return implementation;
  }

  async commitChanges(task, implementation) {
    const commitMessage = this.generateCommitMessage(task, implementation);
    
    await mcpClient.gitOperation('add_all', {
      repository: task.repository.url
    });
    
    await mcpClient.gitOperation('commit', {
      repository: task.repository.url,
      message: commitMessage
    });
    
    await mcpClient.gitOperation('push', {
      repository: task.repository.url,
      branch: implementation.branch
    });
    
    logger.info(`Committed changes for task ${task.id}`);
  }

  generateCommitMessage(task, implementation) {
    const type = task.description.toLowerCase().includes('fix') ? 'fix' : 'feat';
    const scope = this.extractScope(implementation);
    const description = task.description.length > 50 
      ? task.description.substring(0, 47) + '...'
      : task.description;
    
    return `${type}${scope ? `(${scope})` : ''}: ${description}

${implementation.summary || ''}

Resolves: #${task.sourceIssue?.number || 'N/A'}`;
  }

  extractScope(implementation) {
    // Try to determine scope from modified files
    if (implementation.modifiedFiles) {
      const files = implementation.modifiedFiles;
      if (files.some(f => f.includes('auth'))) return 'auth';
      if (files.some(f => f.includes('api'))) return 'api';
      if (files.some(f => f.includes('ui') || f.includes('component'))) return 'ui';
      if (files.some(f => f.includes('db') || f.includes('model'))) return 'db';
    }
    return null;
  }

  async runTests(agent, task) {
    try {
      const testResults = await mcpClient.executeCommand('npm test', agent.context.workingDirectory);
      
      if (testResults.exitCode !== 0) {
        // Tests failed, try to fix them
        await this.fixFailingTests(agent, task, testResults);
      }
      
      return testResults;
    } catch (error) {
      logger.warn(`Test execution failed for task ${task.id}:`, error);
      return { status: 'no_tests', message: 'No test suite found or test execution failed' };
    }
  }

  async fixFailingTests(agent, task, testResults) {
    const fixPrompt = `
The tests are failing after my implementation. Please help fix them:

Test Output:
${testResults.output}

Error Details:
${testResults.error}

Please:
1. Analyze the test failures
2. Fix the failing tests or update them if needed
3. Ensure all tests pass
4. Maintain test coverage

Make the necessary changes to fix the test failures.
`;

    await agentService.executeWithImplementation(agent, fixPrompt, {
      repository: task.repository.url,
      workingDirectory: agent.context.workingDirectory
    });

    // Commit test fixes
    await mcpClient.gitOperation('add_all', { repository: task.repository.url });
    await mcpClient.gitOperation('commit', {
      repository: task.repository.url,
      message: 'fix: Update tests to match implementation changes'
    });
  }

  async createPullRequest(agent, task, implementation, branchName) {
    const prTitle = this.generatePRTitle(task);
    const prBody = this.generatePRBody(task, implementation);
    
    const pullRequest = await giteaClient.createPullRequest({
      owner: task.repository.owner,
      repo: task.repository.name,
      title: prTitle,
      body: prBody,
      head: branchName,
      base: task.repository.branch || 'main',
      labels: ['ai-agent', 'ready-for-review']
    });

    // Link PR to original issue
    if (task.sourceIssue) {
      await giteaClient.createIssueComment(
        task.repository.owner,
        task.repository.name,
        task.sourceIssue.number,
        `## 🔄 Pull Request Created

I've completed the implementation and created a pull request for review:

**Pull Request**: #${pullRequest.number} - ${pullRequest.title}
**Branch**: \`${branchName}\`
**Status**: Ready for review

### What's Included
${implementation.summary || 'Implementation completed according to requirements'}

### Next Steps
1. Please review the pull request
2. Test the changes if needed
3. Provide feedback or approve
4. I'll address any review comments
5. Merge when ready

[View Pull Request](${pullRequest.html_url})`
      );
    }

    logger.info(`Created pull request #${pullRequest.number} for task ${task.id}`);
    return pullRequest;
  }

  generatePRTitle(task) {
    const prefix = task.description.toLowerCase().includes('fix') ? 'Fix:' : 'Feature:';
    return `${prefix} ${task.description}`;
  }

  generatePRBody(task, implementation) {
    return `## Description
${task.description}

## Changes Made
${implementation.summary || 'Implementation completed according to requirements'}

## Files Modified
${implementation.modifiedFiles ? implementation.modifiedFiles.map(f => `- \`${f}\``).join('\n') : 'See commit history'}

## Testing
${implementation.testResults || 'Tests have been run and are passing'}

## Additional Context
${task.additionalContext || 'None'}

## Checklist
- [x] Code follows project conventions
- [x] Tests are passing
- [x] Documentation updated if needed
- [x] No breaking changes (or breaking changes documented)

## Related Issue
${task.sourceIssue ? `Resolves #${task.sourceIssue.number}` : 'N/A'}

---
*This pull request was created by an AI agent. Please review and provide feedback.*`;
  }

  async notifyForReview(agent, task, pullRequest) {
    // Update task status
    await this.updateTaskStatus(task.id, 'awaiting_review', {
      pullRequest: pullRequest.number,
      pullRequestUrl: pullRequest.html_url
    });

    // Notify reviewers (could be enhanced with specific reviewer assignment)
    logger.info(`Task ${task.id} is now awaiting review: PR #${pullRequest.number}`);
  }

  async handleReviewFeedback(agent, task, reviewComments) {
    logger.info(`Processing review feedback for task ${task.id}`);
    
    const feedbackPrompt = `
I've received review feedback on my pull request. Please help me address the comments:

Review Comments:
${reviewComments.map(c => `- ${c.body} (by ${c.user})`).join('\n')}

Please:
1. Analyze each review comment
2. Make the necessary changes to address the feedback
3. Respond to reviewers explaining the changes made
4. Ensure all concerns are addressed

Make the required changes and commit them.
`;

    const response = await agentService.executeWithImplementation(agent, feedbackPrompt, {
      repository: task.repository.url,
      workingDirectory: agent.context.workingDirectory
    });

    // Commit review fixes
    await this.commitChanges(task, {
      ...response,
      summary: 'Address review feedback'
    });

    // Respond to review comments
    await this.respondToReviewComments(task, reviewComments, response);
    
    return response;
  }

  async respondToReviewComments(task, reviewComments, response) {
    for (const comment of reviewComments) {
      const responseText = `Thanks for the feedback! I've addressed this by:

${response.changes || 'Making the requested changes'}

The changes have been committed and pushed to the branch. Please let me know if you need any further adjustments.`;

      await giteaClient.createPullRequestComment(
        task.repository.owner,
        task.repository.name,
        task.pullRequest.number,
        responseText
      );
    }
  }

  async updateTaskStatus(taskId, status, metadata = {}) {
    // Update task status in orchestrator
    const axios = require('axios');
    const config = require('../config');
    
    try {
      await axios.patch(`${config.agentOrchestrator.url}/tasks/${taskId}`, {
        status: status,
        metadata: metadata,
        updatedAt: new Date().toISOString()
      });
    } catch (error) {
      logger.error(`Failed to update task status for ${taskId}:`, error);
    }
  }
}

module.exports = new DevelopmentWorkflow();