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

      // Execute task based on agent type
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

  async initializeWorkingEnvironment(agent, task) {
    // Clone or update repository
    const repoPath = await mcpClient.cloneRepository(
      agent.repositoryInfo.url,
      agent.repositoryInfo.branch || 'main'
    );
    
    agent.context.workingDirectory = repoPath;
    
    // Analyze repository structure
    const structure = await mcpClient.analyzeRepository(repoPath);
    agent.context.repositoryStructure = structure;
    
    // Load relevant files based on task
    const relevantFiles = await this.identifyRelevantFiles(agent, task);
    agent.context.currentFiles = relevantFiles;
    
    logger.info(`Initialized working environment for agent ${agent.id}`);
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
        
        switch (action.type) {
          case 'READ_FILE':
            result = await mcpClient.readFile(action.data.path);
            break;
            
          case 'WRITE_FILE':
            result = await mcpClient.writeFile(action.data.path, action.data.content);
            break;
            
          case 'EXECUTE_COMMAND':
            result = await mcpClient.executeCommand(action.data.command, agent.context.workingDirectory);
            break;
            
          case 'GIT_OPERATION':
            result = await mcpClient.gitOperation(action.data.operation, action.data.params);
            break;
            
          case 'SEARCH_CODE':
            result = await mcpClient.searchCode(action.data.pattern, agent.context.workingDirectory);
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

    // Resume agent execution with human input
    agent.status = 'working';
    logger.info(`Agent ${agentId} resuming with human input`);

    return agent;
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
      agent.status = 'terminated';
      this.activeAgents.delete(agentId);
      logger.info(`Terminated agent: ${agentId}`);
    }
  }
}

module.exports = new AgentService();