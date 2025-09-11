const Bull = require('bull');
const EventEmitter = require('events');
const logger = require('../utils/logger');
const config = require('../config');

class TaskQueue extends EventEmitter {
  constructor() {
    super();
    this.queue = null;
    this.workers = new Map();
    this.taskStatus = new Map();
    this.initialized = false;
    this.processing = false;
  }

  async initialize() {
    try {
      logger.info('Initializing Task Queue...');
      
      // Create Bull queue with Redis connection
      this.queue = new Bull('agent-tasks', {
        redis: {
          host: config.redis.host,
          port: config.redis.port,
          password: config.redis.password,
          db: config.redis.db
        },
        defaultJobOptions: {
          removeOnComplete: 50, // Keep last 50 completed jobs
          removeOnFail: 100,    // Keep last 100 failed jobs
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000
          }
        }
      });

      // Set up event listeners
      this.setupEventListeners();

      // Set up job processors
      this.setupJobProcessors();

      // Start processing
      this.processing = true;
      this.initialized = true;

      logger.info('Task Queue initialized successfully');
      return true;
    } catch (error) {
      logger.error('Failed to initialize Task Queue:', error);
      throw error;
    }
  }

  setupEventListeners() {
    // Queue events
    this.queue.on('ready', () => {
      logger.info('Task queue is ready');
    });

    this.queue.on('error', (error) => {
      logger.error('Task queue error:', error);
    });

    this.queue.on('failed', (job, error) => {
      logger.error(`Task ${job.id} failed:`, error);
      this.updateTaskStatus(job.data.taskId, 'failed', { error: error.message });
      this.emit('task:failed', job.data, error);
    });

    this.queue.on('completed', (job, result) => {
      logger.info(`Task ${job.id} completed successfully`);
      this.updateTaskStatus(job.data.taskId, 'completed', result);
      this.emit('task:completed', job.data, result);
    });

    this.queue.on('stalled', (job) => {
      logger.warn(`Task ${job.id} stalled`);
      this.updateTaskStatus(job.data.taskId, 'stalled');
      this.emit('task:stalled', job.data);
    });

    this.queue.on('progress', (job, progress) => {
      logger.debug(`Task ${job.id} progress: ${progress}%`);
      this.updateTaskStatus(job.data.taskId, 'active', { progress });
      this.emit('task:progress', job.data, { progress });
    });
  }

  setupJobProcessors() {
    // Main task processor
    this.queue.process('agent-task', config.agents.maxConcurrentTasks, async (job) => {
      return await this.processTask(job);
    });

    // Specialized task processors
    this.queue.process('clarification-task', 2, async (job) => {
      return await this.processClarificationTask(job);
    });

    this.queue.process('verification-task', 2, async (job) => {
      return await this.processVerificationTask(job);
    });

    this.queue.process('review-task', 5, async (job) => {
      return await this.processReviewTask(job);
    });
  }

  async addTask(taskData, options = {}) {
    try {
      if (!this.initialized) {
        throw new Error('Task queue not initialized');
      }

      const taskId = taskData.id || `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Prepare job data
      const jobData = {
        taskId: taskId,
        type: taskData.type || 'agent-task',
        description: taskData.description,
        repository: taskData.repository,
        agent: taskData.agent || 'claude',
        priority: taskData.priority || 'medium',
        metadata: taskData.metadata || {},
        createdAt: new Date().toISOString(),
        ...taskData
      };

      // Set job options based on priority
      const jobOptions = {
        priority: this.getPriorityValue(jobData.priority),
        delay: options.delay || 0,
        timeout: (config.agents.taskTimeoutMinutes * 60 * 1000), // Convert to milliseconds
        ...options
      };

      // Add job to queue
      const job = await this.queue.add(jobData.type, jobData, jobOptions);
      
      // Track task status
      this.updateTaskStatus(taskId, 'queued', { jobId: job.id });
      
      logger.info(`Task ${taskId} added to queue with job ID ${job.id}`);
      this.emit('task:queued', jobData);
      
      return {
        taskId: taskId,
        jobId: job.id,
        status: 'queued',
        queuedAt: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Failed to add task to queue:', error);
      throw error;
    }
  }

  async processTask(job) {
    const { taskId, type } = job.data;
    
    try {
      logger.info(`Processing task ${taskId} (${type})`);
      
      // Update status to active
      this.updateTaskStatus(taskId, 'active');
      this.emit('task:started', job.data);
      
      // Get agent service
      const agentService = require('./agentService');
      
      // Create agent for this task
      const agent = await agentService.createAgent(
        job.data.agent,
        taskId,
        job.data.repository
      );
      
      // Update progress
      job.progress(10);
      
      // Execute task based on type
      let result;
      switch (type) {
        case 'agent-task':
          result = await agentService.executeTask(agent, job.data);
          break;
        case 'code-review':
          result = await this.executeCodeReview(agent, job.data);
          break;
        case 'documentation':
          result = await this.executeDocumentation(agent, job.data);
          break;
        case 'testing':
          result = await this.executeTesting(agent, job.data);
          break;
        default:
          throw new Error(`Unknown task type: ${type}`);
      }
      
      // Update progress
      job.progress(100);
      
      logger.info(`Task ${taskId} completed successfully`);
      return result;
      
    } catch (error) {
      logger.error(`Task ${taskId} failed:`, error);
      throw error;
    }
  }

  async processClarificationTask(job) {
    const { taskId } = job.data;
    
    try {
      logger.info(`Processing clarification task ${taskId}`);
      
      const humanLoopService = require('./humanLoopService');
      
      // Create human input request
      const issue = await humanLoopService.requestHumanInput(job.data, {
        type: 'clarification',
        question: job.data.question,
        options: job.data.options,
        urgency: 'medium'
      });
      
      return {
        status: 'awaiting_clarification',
        issue: issue,
        message: 'Clarification request created'
      };
      
    } catch (error) {
      logger.error(`Clarification task ${taskId} failed:`, error);
      throw error;
    }
  }

  async processVerificationTask(job) {
    const { taskId } = job.data;
    
    try {
      logger.info(`Processing verification task ${taskId}`);
      
      const humanLoopService = require('./humanLoopService');
      
      // Create verification request
      const issue = await humanLoopService.requestHumanInput(job.data, {
        type: 'verification',
        question: 'Please verify the implementation plan',
        implementationPlan: job.data.implementationPlan,
        urgency: 'high'
      });
      
      return {
        status: 'awaiting_verification',
        issue: issue,
        message: 'Verification request created'
      };
      
    } catch (error) {
      logger.error(`Verification task ${taskId} failed:`, error);
      throw error;
    }
  }

  async processReviewTask(job) {
    const { taskId } = job.data;
    
    try {
      logger.info(`Processing review task ${taskId}`);
      
      const specializedAgents = require('./specializedAgents');
      
      // Trigger specialized reviews
      const result = await specializedAgents.reviewPullRequest(
        job.data.pullRequest,
        job.data.repository
      );
      
      return {
        status: 'review_completed',
        result: result,
        message: 'Specialized reviews completed'
      };
      
    } catch (error) {
      logger.error(`Review task ${taskId} failed:`, error);
      throw error;
    }
  }

  async executeCodeReview(agent, taskData) {
    // Implement code review logic
    const agentService = require('./agentService');
    
    // Analyze code and provide review
    const reviewResult = await agentService.executeWithImplementation(agent, 
      `Please review the code changes in this repository and provide feedback on:
       1. Code quality and best practices
       2. Potential bugs or issues
       3. Performance considerations
       4. Security concerns
       5. Suggestions for improvement
       
       Repository: ${taskData.repository.url}
       Branch: ${taskData.repository.branch || 'main'}`,
      { repository: taskData.repository.url }
    );
    
    return {
      type: 'code_review',
      review: reviewResult,
      completedAt: new Date().toISOString()
    };
  }

  async executeDocumentation(agent, taskData) {
    // Implement documentation generation logic
    const agentService = require('./agentService');
    
    const docResult = await agentService.executeWithImplementation(agent,
      `Please generate comprehensive documentation for this repository:
       1. README.md with project overview
       2. API documentation if applicable
       3. Installation and usage instructions
       4. Contributing guidelines
       5. Code examples and tutorials
       
       Repository: ${taskData.repository.url}
       Focus: ${taskData.additionalContext || 'General documentation'}`,
      { repository: taskData.repository.url }
    );
    
    return {
      type: 'documentation',
      documentation: docResult,
      completedAt: new Date().toISOString()
    };
  }

  async executeTesting(agent, taskData) {
    // Implement testing logic
    const agentService = require('./agentService');
    
    const testResult = await agentService.executeWithImplementation(agent,
      `Please create comprehensive tests for this repository:
       1. Unit tests for core functionality
       2. Integration tests for API endpoints
       3. End-to-end tests for critical workflows
       4. Test configuration and setup
       5. Coverage reports and quality gates
       
       Repository: ${taskData.repository.url}
       Testing Framework: ${taskData.testingFramework || 'Auto-detect'}`,
      { repository: taskData.repository.url }
    );
    
    return {
      type: 'testing',
      tests: testResult,
      completedAt: new Date().toISOString()
    };
  }

  getPriorityValue(priority) {
    const priorities = {
      'low': 1,
      'medium': 5,
      'high': 10,
      'urgent': 15
    };
    return priorities[priority] || 5;
  }

  updateTaskStatus(taskId, status, data = {}) {
    const currentStatus = this.taskStatus.get(taskId) || {};
    const updatedStatus = {
      ...currentStatus,
      taskId: taskId,
      status: status,
      updatedAt: new Date().toISOString(),
      ...data
    };
    
    this.taskStatus.set(taskId, updatedStatus);
    
    // Emit status update event
    this.emit('task:status_updated', updatedStatus);
  }

  async getTaskStatus(taskId) {
    const status = this.taskStatus.get(taskId);
    if (!status) {
      return null;
    }
    
    // Get additional info from Bull queue if job ID is available
    if (status.jobId) {
      try {
        const job = await this.queue.getJob(status.jobId);
        if (job) {
          status.jobData = {
            progress: job.progress(),
            processedOn: job.processedOn,
            finishedOn: job.finishedOn,
            failedReason: job.failedReason,
            returnvalue: job.returnvalue
          };
        }
      } catch (error) {
        logger.warn(`Failed to get job data for task ${taskId}:`, error);
      }
    }
    
    return status;
  }

  async listTasks(options = {}) {
    const {
      status = null,
      agent = null,
      priority = null,
      limit = 50,
      offset = 0
    } = options;
    
    let tasks = Array.from(this.taskStatus.values());
    
    // Apply filters
    if (status) {
      tasks = tasks.filter(task => task.status === status);
    }
    
    if (agent) {
      tasks = tasks.filter(task => task.agent === agent);
    }
    
    if (priority) {
      tasks = tasks.filter(task => task.priority === priority);
    }
    
    // Sort by creation time (newest first)
    tasks.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    // Apply pagination
    const total = tasks.length;
    tasks = tasks.slice(offset, offset + limit);
    
    return {
      tasks: tasks,
      pagination: {
        total: total,
        limit: limit,
        offset: offset,
        hasMore: offset + limit < total
      }
    };
  }

  async pauseTask(taskId) {
    try {
      const status = this.taskStatus.get(taskId);
      if (!status || !status.jobId) {
        throw new Error(`Task ${taskId} not found or no job ID`);
      }
      
      const job = await this.queue.getJob(status.jobId);
      if (!job) {
        throw new Error(`Job ${status.jobId} not found`);
      }
      
      await job.pause();
      this.updateTaskStatus(taskId, 'paused');
      
      logger.info(`Task ${taskId} paused`);
      this.emit('task:paused', { taskId });
      
      return true;
    } catch (error) {
      logger.error(`Failed to pause task ${taskId}:`, error);
      throw error;
    }
  }

  async resumeTask(taskId) {
    try {
      const status = this.taskStatus.get(taskId);
      if (!status || !status.jobId) {
        throw new Error(`Task ${taskId} not found or no job ID`);
      }
      
      const job = await this.queue.getJob(status.jobId);
      if (!job) {
        throw new Error(`Job ${status.jobId} not found`);
      }
      
      await job.resume();
      this.updateTaskStatus(taskId, 'active');
      
      logger.info(`Task ${taskId} resumed`);
      this.emit('task:resumed', { taskId });
      
      return true;
    } catch (error) {
      logger.error(`Failed to resume task ${taskId}:`, error);
      throw error;
    }
  }

  async cancelTask(taskId, reason = 'cancelled') {
    try {
      const status = this.taskStatus.get(taskId);
      if (!status) {
        throw new Error(`Task ${taskId} not found`);
      }
      
      if (status.jobId) {
        const job = await this.queue.getJob(status.jobId);
        if (job) {
          await job.remove();
        }
      }
      
      this.updateTaskStatus(taskId, 'cancelled', { reason });
      
      logger.info(`Task ${taskId} cancelled: ${reason}`);
      this.emit('task:cancelled', { taskId, reason });
      
      return true;
    } catch (error) {
      logger.error(`Failed to cancel task ${taskId}:`, error);
      throw error;
    }
  }

  async retryTask(taskId) {
    try {
      const status = this.taskStatus.get(taskId);
      if (!status || !status.jobId) {
        throw new Error(`Task ${taskId} not found or no job ID`);
      }
      
      const job = await this.queue.getJob(status.jobId);
      if (!job) {
        throw new Error(`Job ${status.jobId} not found`);
      }
      
      await job.retry();
      this.updateTaskStatus(taskId, 'queued');
      
      logger.info(`Task ${taskId} retried`);
      this.emit('task:retried', { taskId });
      
      return true;
    } catch (error) {
      logger.error(`Failed to retry task ${taskId}:`, error);
      throw error;
    }
  }

  async getQueueStats() {
    try {
      const waiting = await this.queue.getWaiting();
      const active = await this.queue.getActive();
      const completed = await this.queue.getCompleted();
      const failed = await this.queue.getFailed();
      const delayed = await this.queue.getDelayed();
      const paused = await this.queue.getPaused();
      
      return {
        waiting: waiting.length,
        active: active.length,
        completed: completed.length,
        failed: failed.length,
        delayed: delayed.length,
        paused: paused.length,
        total: waiting.length + active.length + completed.length + failed.length + delayed.length + paused.length
      };
    } catch (error) {
      logger.error('Failed to get queue stats:', error);
      throw error;
    }
  }

  async cleanupCompletedTasks(olderThanHours = 24) {
    try {
      const cutoffTime = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);
      
      // Clean up completed jobs
      await this.queue.clean(olderThanHours * 60 * 60 * 1000, 'completed');
      await this.queue.clean(olderThanHours * 60 * 60 * 1000, 'failed');
      
      // Clean up task status cache
      let cleanedCount = 0;
      for (const [taskId, status] of this.taskStatus) {
        if (status.updatedAt && new Date(status.updatedAt) < cutoffTime) {
          if (status.status === 'completed' || status.status === 'failed' || status.status === 'cancelled') {
            this.taskStatus.delete(taskId);
            cleanedCount++;
          }
        }
      }
      
      logger.info(`Cleaned up ${cleanedCount} old task statuses`);
      return cleanedCount;
    } catch (error) {
      logger.error('Failed to cleanup completed tasks:', error);
      throw error;
    }
  }

  async close() {
    try {
      if (this.queue) {
        await this.queue.close();
        this.processing = false;
        this.initialized = false;
        logger.info('Task queue closed');
      }
    } catch (error) {
      logger.error('Failed to close task queue:', error);
      throw error;
    }
  }

  isReady() {
    return this.initialized && this.processing;
  }

  // Utility methods for task creation
  createCodeTask(repository, description, agent = 'claude', priority = 'medium') {
    return this.addTask({
      type: 'agent-task',
      description: description,
      repository: repository,
      agent: agent,
      priority: priority
    });
  }

  createReviewTask(pullRequest, repository, priority = 'medium') {
    return this.addTask({
      type: 'review-task',
      description: `Review pull request #${pullRequest.number}`,
      pullRequest: pullRequest,
      repository: repository,
      priority: priority
    });
  }

  createDocumentationTask(repository, focus = 'general', agent = 'claude', priority = 'low') {
    return this.addTask({
      type: 'documentation',
      description: 'Generate comprehensive documentation',
      repository: repository,
      agent: agent,
      priority: priority,
      additionalContext: focus
    });
  }

  createTestingTask(repository, framework = 'auto-detect', agent = 'openai', priority = 'medium') {
    return this.addTask({
      type: 'testing',
      description: 'Create comprehensive test suite',
      repository: repository,
      agent: agent,
      priority: priority,
      testingFramework: framework
    });
  }
}

module.exports = new TaskQueue();