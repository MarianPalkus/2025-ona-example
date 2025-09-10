const Anthropic = require('@anthropic-ai/sdk');
const OpenAI = require('openai');
const logger = require('../utils/logger');
const config = require('../config');
const mcpClient = require('./mcpClient');
const humanLoopService = require('./humanLoopService');

class AgentService {
  constructor() {
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
    
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    
    this.activeAgents = new Map();
  }

  async createAgent(type, taskId, repositoryInfo) {
    const agentId = `${type}_${taskId}_${Date.now()}`;
    
    const agent = {
      id: agentId,
      type: type,
      taskId: taskId,
      repositoryInfo: repositoryInfo,
      status: 'initializing',
      context: {
        conversationHistory: [],
        currentFiles: [],
        workingDirectory: null,
        lastAction: null
      },
      capabilities: this.getAgentCapabilities(type),
      createdAt: new Date()
    };
    
    this.activeAgents.set(agentId, agent);
    logger.info(`Created ${type} agent: ${agentId}`);
    
    return agent;
  }

  getAgentCapabilities(type) {
    const baseCapabilities = [
      'read_file',
      'write_file',
      'list_directory',
      'execute_command',
      'git_operations',
      'search_code',
      'analyze_dependencies'
    ];

    const typeSpecificCapabilities = {
      claude: [
        'advanced_reasoning',
        'code_analysis',
        'architectural_planning',
        'documentation_generation',
        'test_generation'
      ],
      openai: [
        'code_completion',
        'bug_detection',
        'refactoring_suggestions',
        'api_integration',
        'performance_optimization'
      ]
    };

    return [...baseCapabilities, ...(typeSpecificCapabilities[type] || [])];
  }

  async executeTask(agent, task) {
    try {
      agent.status = 'working';
      logger.info(`Agent ${agent.id} starting task: ${task.description}`);

      // Initialize working environment
      await this.initializeWorkingEnvironment(agent, task);

      // Use development workflow for code-related tasks
      if (this.isCodeTask(task)) {
        const developmentWorkflow = require('./developmentWorkflow');
        return await developmentWorkflow.executeWorkflow(agent, task);
      }

      // Execute task based on agent type for non-code tasks
      let result;
      if (agent.type === 'claude') {
        result = await this.executeWithClaude(agent, task);
      } else if (agent.type === 'openai') {
        result = await this.executeWithOpenAI(agent, task);
      } else {
        throw new Error(`Unknown agent type: ${agent.type}`);
      }

      agent.status = 'completed';
      logger.info(`Agent ${agent.id} completed task`);
      
      return result;
    } catch (error) {
      agent.status = 'failed';
      logger.error(`Agent ${agent.id} failed:`, error);
      throw error;
    }
  }

  isCodeTask(task) {
    const codeIndicators = [
      'implement', 'add', 'create', 'build', 'develop', 'code',
      'fix', 'bug', 'error', 'issue', 'refactor', 'optimize',
      'feature', 'function', 'method', 'class', 'component',
      'api', 'endpoint', 'database', 'model', 'service',
      'test', 'unit test', 'integration', 'authentication',
      'security', 'performance', 'migration', 'update'
    ];
    
    const description = task.description.toLowerCase();
    return codeIndicators.some(indicator => description.includes(indicator));
  }

  async initializeWorkingEnvironment(agent, task) {
    try {
      // Create dev container for agent execution
      const devContainerService = require('./devContainerService');
      const containerId = await devContainerService.createAgentContainer(agent, task);
      
      // Clone repository into the dev container
      const repoPath = await devContainerService.cloneRepositoryInContainer(
        containerId,
        task.repository.url,
        task.repository.branch || 'main'
      );
      
      // Install dependencies in the container
      const analysis = await devContainerService.analyzeRepository(task.repository);
      if (analysis.packageManagers.length > 0) {
        await devContainerService.installDependencies(containerId, analysis.packageManagers[0]);
      }
      
      agent.context.workingDirectory = repoPath;
      agent.context.containerId = containerId;
      
      // Analyze repository structure within the container
      const structure = await this.analyzeRepositoryInContainer(agent, containerId);
      agent.context.repositoryStructure = structure;
      
      // Load relevant files based on task
      const relevantFiles = await this.identifyRelevantFiles(agent, task);
      agent.context.currentFiles = relevantFiles;
      
      logger.info(`Initialized dev container environment for agent ${agent.id}: ${containerId}`);
      
    } catch (error) {
      logger.error(`Failed to initialize working environment for agent ${agent.id}:`, error);
      // Fallback to traditional approach if dev container fails
      await this.initializeFallbackEnvironment(agent, task);
    }
  }

  async analyzeRepositoryInContainer(agent, containerId) {
    try {
      const devContainerService = require('./devContainerService');
      
      // Get repository structure
      const lsResult = await devContainerService.executeInContainer(
        containerId,
        'find /workspace/repository -type f -name "*.js" -o -name "*.ts" -o -name "*.py" -o -name "*.go" -o -name "*.rs" -o -name "*.java" | head -20'
      );
      
      // Get package files
      const packageResult = await devContainerService.executeInContainer(
        containerId,
        'find /workspace/repository -name "package.json" -o -name "requirements.txt" -o -name "Cargo.toml" -o -name "pom.xml" -o -name "go.mod"'
      );
      
      return {
        files: lsResult.stdout.split('\n').filter(f => f.trim()),
        packageFiles: packageResult.stdout.split('\n').filter(f => f.trim()),
        analyzedAt: new Date()
      };
      
    } catch (error) {
      logger.error('Failed to analyze repository in container:', error);
      return { files: [], packageFiles: [], error: error.message };
    }
  }

  async initializeFallbackEnvironment(agent, task) {
    // Fallback to original MCP client approach
    const repoPath = await mcpClient.cloneRepository(
      task.repository.url,
      task.repository.branch || 'main'
    );
    
    agent.context.workingDirectory = repoPath;
    
    // Analyze repository structure
    const structure = await mcpClient.analyzeRepository(repoPath);
    agent.context.repositoryStructure = structure;
    
    // Load relevant files based on task
    const relevantFiles = await this.identifyRelevantFiles(agent, task);
    agent.context.currentFiles = relevantFiles;
    
    logger.info(`Initialized fallback environment for agent ${agent.id}`);
  }

  async identifyRelevantFiles(agent, task) {
    const keywords = this.extractKeywords(task.description);
    const files = await mcpClient.searchFiles(agent.context.workingDirectory, keywords);
    
    // Limit to most relevant files to avoid context overflow
    return files.slice(0, 10);
  }

  extractKeywords(description) {
    // Simple keyword extraction - could be enhanced with NLP
    const words = description.toLowerCase().split(/\s+/);
    const stopWords = ['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by'];
    return words.filter(word => !stopWords.includes(word) && word.length > 2);
  }

  async executeWithClaude(agent, task) {
    const systemPrompt = this.buildSystemPrompt(agent, task);
    const userPrompt = this.buildUserPrompt(agent, task);

    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
      try {
        const response = await this.anthropic.messages.create({
          model: 'claude-3-sonnet-20240229',
          max_tokens: 4000,
          system: systemPrompt,
          messages: [
            ...agent.context.conversationHistory,
            { role: 'user', content: userPrompt }
          ]
        });

        const assistantMessage = response.content[0].text;
        
        // Parse and execute actions from Claude's response
        const actions = this.parseActions(assistantMessage);
        const results = await this.executeActions(agent, actions);

        // Check if human input is needed
        if (this.requiresHumanInput(assistantMessage, results)) {
          await this.requestHumanInput(agent, task, assistantMessage, results);
          return { status: 'awaiting_human_input', message: assistantMessage };
        }

        // Update conversation history
        agent.context.conversationHistory.push(
          { role: 'user', content: userPrompt },
          { role: 'assistant', content: assistantMessage }
        );

        return {
          status: 'completed',
          message: assistantMessage,
          actions: actions,
          results: results
        };

      } catch (error) {
        attempts++;
        logger.error(`Claude execution attempt ${attempts} failed:`, error);
        
        if (attempts >= maxAttempts) {
          throw error;
        }
        
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 1000 * attempts));
      }
    }
  }

  async executeWithOpenAI(agent, task) {
    const systemPrompt = this.buildSystemPrompt(agent, task);
    const userPrompt = this.buildUserPrompt(agent, task);

    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
      try {
        const response = await this.openai.chat.completions.create({
          model: 'gpt-4',
          max_tokens: 4000,
          messages: [
            { role: 'system', content: systemPrompt },
            ...agent.context.conversationHistory,
            { role: 'user', content: userPrompt }
          ]
        });

        const assistantMessage = response.choices[0].message.content;
        
        // Parse and execute actions
        const actions = this.parseActions(assistantMessage);
        const results = await this.executeActions(agent, actions);

        // Check if human input is needed
        if (this.requiresHumanInput(assistantMessage, results)) {
          await this.requestHumanInput(agent, task, assistantMessage, results);
          return { status: 'awaiting_human_input', message: assistantMessage };
        }

        // Update conversation history
        agent.context.conversationHistory.push(
          { role: 'user', content: userPrompt },
          { role: 'assistant', content: assistantMessage }
        );

        return {
          status: 'completed',
          message: assistantMessage,
          actions: actions,
          results: results
        };

      } catch (error) {
        attempts++;
        logger.error(`OpenAI execution attempt ${attempts} failed:`, error);
        
        if (attempts >= maxAttempts) {
          throw error;
        }
        
        await new Promise(resolve => setTimeout(resolve, 1000 * attempts));
      }
    }
  }

  buildSystemPrompt(agent, task) {
    return `You are an AI software development agent working on a Git repository. Your capabilities include:
${agent.capabilities.map(cap => `- ${cap}`).join('\n')}

Repository Information:
- Name: ${agent.repositoryInfo.name}
- URL: ${agent.repositoryInfo.url}
- Branch: ${agent.repositoryInfo.branch || 'main'}
- Working Directory: ${agent.context.workingDirectory}

Current Task: ${task.description}

Guidelines:
1. Always analyze the codebase before making changes
2. Follow existing code patterns and conventions
3. Write clear, maintainable code
4. Include appropriate tests when adding new functionality
5. Use descriptive commit messages
6. If you need human input or clarification, clearly state what you need
7. Break down complex tasks into smaller steps
8. Verify your changes work correctly

Available Actions:
- READ_FILE: Read the contents of a file
- WRITE_FILE: Write or modify a file
- EXECUTE_COMMAND: Run a shell command
- GIT_OPERATION: Perform git operations (add, commit, push, etc.)
- SEARCH_CODE: Search for code patterns
- REQUEST_HUMAN_INPUT: Ask for human guidance

Format your response with clear action blocks:
\`\`\`action:ACTION_TYPE
{action parameters}
\`\`\`

Always explain your reasoning and next steps.`;
  }

  buildUserPrompt(agent, task) {
    let prompt = `Please work on the following task: ${task.description}\n\n`;
    
    if (agent.context.repositoryStructure) {
      prompt += `Repository Structure:\n${JSON.stringify(agent.context.repositoryStructure, null, 2)}\n\n`;
    }
    
    if (agent.context.currentFiles.length > 0) {
      prompt += `Relevant Files:\n${agent.context.currentFiles.map(f => `- ${f}`).join('\n')}\n\n`;
    }
    
    if (task.additionalContext) {
      prompt += `Additional Context:\n${task.additionalContext}\n\n`;
    }
    
    prompt += 'Please analyze the situation and proceed with the task.';
    
    return prompt;
  }

  parseActions(message) {
    const actionRegex = /```action:(\w+)\n([\s\S]*?)```/g;
    const actions = [];
    let match;

    while ((match = actionRegex.exec(message)) !== null) {
      const actionType = match[1];
      const actionContent = match[2].trim();
      
      try {
        const actionData = JSON.parse(actionContent);
        actions.push({
          type: actionType,
          data: actionData
        });
      } catch (error) {
        logger.warn(`Failed to parse action: ${actionType}`, error);
      }
    }

    return actions;
  }

  async executeActions(agent, actions) {
    const results = [];

    for (const action of actions) {
      try {
        let result;
        
        // Use dev container if available, otherwise fallback to MCP client
        const useDevContainer = agent.context.containerId && agent.context.devContainer;
        
        switch (action.type) {
          case 'READ_FILE':
            if (useDevContainer) {
              result = await this.readFileInContainer(agent, action.data.path);
            } else {
              result = await mcpClient.readFile(action.data.path);
            }
            break;
            
          case 'WRITE_FILE':
            if (useDevContainer) {
              result = await this.writeFileInContainer(agent, action.data.path, action.data.content);
            } else {
              result = await mcpClient.writeFile(action.data.path, action.data.content);
            }
            break;
            
          case 'EXECUTE_COMMAND':
            if (useDevContainer) {
              result = await this.executeCommandInContainer(agent, action.data.command);
            } else {
              result = await mcpClient.executeCommand(action.data.command, agent.context.workingDirectory);
            }
            break;
            
          case 'GIT_OPERATION':
            if (useDevContainer) {
              result = await this.executeGitInContainer(agent, action.data.operation, action.data.params);
            } else {
              result = await mcpClient.gitOperation(action.data.operation, action.data.params);
            }
            break;
            
          case 'SEARCH_CODE':
            if (useDevContainer) {
              result = await this.searchCodeInContainer(agent, action.data.pattern);
            } else {
              result = await mcpClient.searchCode(action.data.pattern, agent.context.workingDirectory);
            }
            break;
            
          case 'RUN_TESTS':
            if (useDevContainer) {
              result = await this.runTestsInContainer(agent, action.data.testCommand);
            } else {
              result = await mcpClient.executeCommand(action.data.testCommand || 'npm test', agent.context.workingDirectory);
            }
            break;
            
          case 'INSTALL_DEPENDENCIES':
            if (useDevContainer) {
              result = await this.installDependenciesInContainer(agent, action.data.packageManager);
            } else {
              result = await mcpClient.executeCommand('npm install', agent.context.workingDirectory);
            }
            break;
            
          case 'REQUEST_HUMAN_INPUT':
            // This will be handled separately
            result = { status: 'human_input_requested' };
            break;
            
          default:
            throw new Error(`Unknown action type: ${action.type}`);
        }
        
        results.push({
          action: action,
          result: result,
          status: 'success'
        });
        
      } catch (error) {
        logger.error(`Action execution failed:`, error);
        results.push({
          action: action,
          error: error.message,
          status: 'failed'
        });
      }
    }

    return results;
  }

  async readFileInContainer(agent, filePath) {
    const devContainerService = require('./devContainerService');
    const command = `cat "/workspace/repository/${filePath}"`;
    const result = await devContainerService.executeInContainer(agent.context.containerId, command);
    
    if (result.exitCode !== 0) {
      throw new Error(`Failed to read file: ${result.stderr}`);
    }
    
    return { content: result.stdout, path: filePath };
  }

  async writeFileInContainer(agent, filePath, content) {
    const devContainerService = require('./devContainerService');
    
    // Escape content for shell
    const escapedContent = content.replace(/'/g, "'\"'\"'");
    const command = `echo '${escapedContent}' > "/workspace/repository/${filePath}"`;
    
    const result = await devContainerService.executeInContainer(agent.context.containerId, command);
    
    if (result.exitCode !== 0) {
      throw new Error(`Failed to write file: ${result.stderr}`);
    }
    
    return { path: filePath, written: true };
  }

  async executeCommandInContainer(agent, command) {
    const devContainerService = require('./devContainerService');
    const fullCommand = `cd /workspace/repository && ${command}`;
    
    return await devContainerService.executeInContainer(agent.context.containerId, fullCommand);
  }

  async executeGitInContainer(agent, operation, params) {
    const devContainerService = require('./devContainerService');
    let gitCommand;
    
    switch (operation) {
      case 'add':
        gitCommand = `git add ${params.files ? params.files.join(' ') : '.'}`;
        break;
      case 'commit':
        gitCommand = `git commit -m "${params.message}"`;
        break;
      case 'push':
        gitCommand = `git push origin ${params.branch || 'HEAD'}`;
        break;
      case 'checkout':
        gitCommand = `git checkout ${params.branch}`;
        break;
      case 'create_branch':
        gitCommand = `git checkout -b ${params.branchName}`;
        break;
      case 'status':
        gitCommand = 'git status --porcelain';
        break;
      default:
        throw new Error(`Unknown git operation: ${operation}`);
    }
    
    const fullCommand = `cd /workspace/repository && ${gitCommand}`;
    return await devContainerService.executeInContainer(agent.context.containerId, fullCommand);
  }

  async searchCodeInContainer(agent, pattern) {
    const devContainerService = require('./devContainerService');
    const command = `cd /workspace/repository && grep -r "${pattern}" --include="*.js" --include="*.ts" --include="*.py" --include="*.go" --include="*.rs" --include="*.java" . || true`;
    
    const result = await devContainerService.executeInContainer(agent.context.containerId, command);
    
    return {
      pattern: pattern,
      matches: result.stdout.split('\n').filter(line => line.trim()),
      searchedAt: new Date()
    };
  }

  async runTestsInContainer(agent, testCommand = 'npm test') {
    const devContainerService = require('./devContainerService');
    return await devContainerService.runTests(agent.context.containerId, testCommand);
  }

  async installDependenciesInContainer(agent, packageManager = 'npm') {
    const devContainerService = require('./devContainerService');
    return await devContainerService.installDependencies(agent.context.containerId, packageManager);
  }

  requiresHumanInput(message, results) {
    // Check if the agent explicitly requested human input
    if (message.includes('REQUEST_HUMAN_INPUT') || message.includes('human input')) {
      return true;
    }
    
    // Check if any actions failed that might need human intervention
    const failedActions = results.filter(r => r.status === 'failed');
    if (failedActions.length > 0) {
      return true;
    }
    
    // Check for uncertainty indicators in the message
    const uncertaintyIndicators = [
      'not sure',
      'unclear',
      'need clarification',
      'should I',
      'which approach',
      'need guidance'
    ];
    
    return uncertaintyIndicators.some(indicator => 
      message.toLowerCase().includes(indicator)
    );
  }

  async requestHumanInput(agent, task, message, results) {
    const context = {
      agentId: agent.id,
      taskId: task.id,
      repositoryInfo: agent.repositoryInfo,
      currentMessage: message,
      actionResults: results,
      question: this.extractQuestion(message),
      options: this.extractOptions(message),
      urgency: this.assessUrgency(message, results)
    };

    await humanLoopService.requestHumanInput(task, context);
  }

  extractQuestion(message) {
    // Simple question extraction - could be enhanced
    const sentences = message.split(/[.!?]+/);
    const questions = sentences.filter(s => s.includes('?') || s.toLowerCase().includes('should'));
    return questions.join(' ') || 'Agent needs guidance on how to proceed.';
  }

  extractOptions(message) {
    // Look for numbered or bulleted options
    const optionRegex = /(?:^|\n)\s*(?:\d+\.|\*|-)\s*(.+)/gm;
    const options = [];
    let match;

    while ((match = optionRegex.exec(message)) !== null) {
      options.push(match[1].trim());
    }

    return options.length > 0 ? options : null;
  }

  assessUrgency(message, results) {
    const failedActions = results.filter(r => r.status === 'failed');
    if (failedActions.length > 0) return 'high';
    
    const urgencyKeywords = ['urgent', 'critical', 'blocking', 'error', 'failed'];
    if (urgencyKeywords.some(keyword => message.toLowerCase().includes(keyword))) {
      return 'high';
    }
    
    return 'medium';
  }

  async processHumanResponse(agentId, response) {
    const agent = this.activeAgents.get(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    // Add human response to conversation history
    agent.context.conversationHistory.push({
      role: 'user',
      content: `Human response: ${response.content}`,
      timestamp: new Date(),
      isHumanResponse: true
    });

    // Handle different types of human responses
    if (response.type === 'clarification') {
      await this.processClarificationResponse(agent, response);
    } else if (response.type === 'verification') {
      await this.processVerificationResponse(agent, response);
    } else if (response.type === 'review_feedback') {
      await this.processReviewFeedback(agent, response);
    }

    // Resume agent execution with human input
    agent.status = 'working';
    logger.info(`Agent ${agentId} resuming with human input`);

    return agent;
  }

  async processClarificationResponse(agent, response) {
    // Parse clarification answers and update task context
    const answers = this.parseAnswers(response.content);
    agent.context.clarificationAnswers = answers;
    
    // Continue with development workflow
    const developmentWorkflow = require('./developmentWorkflow');
    await developmentWorkflow.continueAfterClarification(agent, answers);
  }

  async processVerificationResponse(agent, response) {
    // Parse verification response (approval/feedback)
    const verification = this.parseVerification(response.content);
    agent.context.verificationResponse = verification;
    
    if (verification.approved) {
      // Continue with implementation
      const developmentWorkflow = require('./developmentWorkflow');
      await developmentWorkflow.continueAfterVerification(agent, verification);
    } else {
      // Revise implementation plan based on feedback
      await this.reviseImplementationPlan(agent, verification.feedback);
    }
  }

  async processReviewFeedback(agent, response) {
    // Handle pull request review feedback
    const developmentWorkflow = require('./developmentWorkflow');
    await developmentWorkflow.handleReviewFeedback(agent, agent.currentTask, response.reviewComments);
  }

  parseAnswers(content) {
    const answers = {};
    const answerRegex = /ANSWER\s+(\d+):\s*(.+?)(?=ANSWER\s+\d+:|$)/gis;
    let match;
    
    while ((match = answerRegex.exec(content)) !== null) {
      answers[parseInt(match[1])] = match[2].trim();
    }
    
    // If no structured answers found, treat entire content as general answer
    if (Object.keys(answers).length === 0) {
      answers[1] = content;
    }
    
    return answers;
  }

  parseVerification(content) {
    const approvalMatch = content.match(/APPROVAL:\s*(Yes|No)/i);
    const feedbackMatch = content.match(/FEEDBACK:\s*(.+?)(?=PROCEED:|$)/is);
    const proceedMatch = content.match(/PROCEED:\s*(.+?)$/is);
    
    return {
      approved: approvalMatch ? approvalMatch[1].toLowerCase() === 'yes' : false,
      feedback: feedbackMatch ? feedbackMatch[1].trim() : '',
      instructions: proceedMatch ? proceedMatch[1].trim() : ''
    };
  }

  async reviseImplementationPlan(agent, feedback) {
    const revisionPrompt = `
The human reviewer provided feedback on my implementation plan. Please revise the plan based on their input:

Original Plan: ${agent.context.implementationPlan?.fullPlan || 'N/A'}

Human Feedback: ${feedback}

Please create a revised implementation plan that addresses the feedback and concerns raised.
`;

    const revisedPlan = await this.queryAgent(agent, revisionPrompt);
    agent.context.implementationPlan = this.parseImplementationPlan(revisedPlan);
    
    // Request verification again for the revised plan
    const developmentWorkflow = require('./developmentWorkflow');
    await developmentWorkflow.requestOutcomeVerification(agent, agent.currentTask, agent.context.implementationPlan);
  }

  async queryAgent(agent, prompt) {
    if (agent.type === 'claude') {
      return await this.queryClaudeAgent(agent, prompt);
    } else if (agent.type === 'openai') {
      return await this.queryOpenAIAgent(agent, prompt);
    }
    throw new Error(`Unknown agent type: ${agent.type}`);
  }

  async queryClaudeAgent(agent, prompt) {
    const response = await this.anthropic.messages.create({
      model: 'claude-3-sonnet-20240229',
      max_tokens: 4000,
      messages: [
        ...agent.context.conversationHistory,
        { role: 'user', content: prompt }
      ]
    });
    
    return response.content[0].text;
  }

  async queryOpenAIAgent(agent, prompt) {
    const response = await this.openai.chat.completions.create({
      model: 'gpt-4',
      max_tokens: 4000,
      messages: [
        ...agent.context.conversationHistory,
        { role: 'user', content: prompt }
      ]
    });
    
    return response.choices[0].message.content;
  }

  async executeWithImplementation(agent, prompt, context) {
    // Execute agent with implementation capabilities
    const response = await this.queryAgent(agent, prompt);
    const actions = this.parseActions(response);
    const results = await this.executeActions(agent, actions);
    
    return {
      message: response,
      actions: actions,
      results: results,
      modifiedFiles: this.extractModifiedFiles(results),
      summary: this.generateSummary(response, results)
    };
  }

  extractModifiedFiles(results) {
    const files = [];
    for (const result of results) {
      if (result.action.type === 'WRITE_FILE' && result.status === 'success') {
        files.push(result.action.data.path);
      }
    }
    return files;
  }

  generateSummary(response, results) {
    const successfulActions = results.filter(r => r.status === 'success').length;
    const totalActions = results.length;
    
    return `Completed ${successfulActions}/${totalActions} actions successfully. ${response.substring(0, 200)}...`;
  }

  getAgent(agentId) {
    return this.activeAgents.get(agentId);
  }

  listActiveAgents() {
    return Array.from(this.activeAgents.values());
  }

  async terminateAgent(agentId) {
    const agent = this.activeAgents.get(agentId);
    if (agent) {
      // Clean up dev container if it exists
      if (agent.context.containerId) {
        try {
          const devContainerService = require('./devContainerService');
          await devContainerService.stopContainer(agent.context.containerId);
          logger.info(`Cleaned up dev container for agent ${agentId}: ${agent.context.containerId}`);
        } catch (error) {
          logger.error(`Failed to cleanup dev container for agent ${agentId}:`, error);
        }
      }
      
      agent.status = 'terminated';
      this.activeAgents.delete(agentId);
      logger.info(`Terminated agent: ${agentId}`);
    }
  }
}

module.exports = new AgentService();