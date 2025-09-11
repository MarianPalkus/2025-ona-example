const axios = require('axios');
const logger = require('../utils/logger');
const config = require('../config');

class MCPClient {
  constructor() {
    this.baseURL = process.env.MCP_SERVER_URL || 'http://mcp-git-server:8080';
    this.connected = false;
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    // Add request/response interceptors for logging
    this.client.interceptors.request.use(
      (config) => {
        logger.debug(`MCP Request: ${config.method?.toUpperCase()} ${config.url}`);
        return config;
      },
      (error) => {
        logger.error('MCP Request Error:', error);
        return Promise.reject(error);
      }
    );

    this.client.interceptors.response.use(
      (response) => {
        logger.debug(`MCP Response: ${response.status} ${response.config.url}`);
        return response;
      },
      (error) => {
        logger.error(`MCP Response Error: ${error.response?.status} ${error.config?.url}`, error.message);
        return Promise.reject(error);
      }
    );
  }

  async connect() {
    try {
      const response = await this.client.get('/health');
      this.connected = response.status === 200;
      logger.info(`Connected to MCP server: ${this.baseURL}`);
      return this.connected;
    } catch (error) {
      this.connected = false;
      logger.error(`Failed to connect to MCP server: ${this.baseURL}`, error.message);
      throw error;
    }
  }

  async disconnect() {
    this.connected = false;
    logger.info('Disconnected from MCP server');
  }

  isConnected() {
    return this.connected;
  }

  // Repository operations
  async cloneRepository(url, branch = 'main', targetPath = null) {
    try {
      const response = await this.client.post('/git/clone', {
        url: url,
        branch: branch,
        targetPath: targetPath
      });
      
      logger.info(`Repository cloned: ${url} (branch: ${branch})`);
      return response.data.path;
    } catch (error) {
      logger.error(`Failed to clone repository: ${url}`, error);
      throw error;
    }
  }

  async analyzeRepository(repositoryPath) {
    try {
      const response = await this.client.post('/git/analyze', {
        repositoryPath: repositoryPath
      });
      
      return response.data;
    } catch (error) {
      logger.error(`Failed to analyze repository: ${repositoryPath}`, error);
      throw error;
    }
  }

  // File operations
  async readFile(filePath) {
    try {
      const response = await this.client.post('/mcp/read-file', {
        path: filePath
      });
      
      return response.data;
    } catch (error) {
      logger.error(`Failed to read file: ${filePath}`, error);
      throw error;
    }
  }

  async writeFile(filePath, content) {
    try {
      const response = await this.client.post('/mcp/write-file', {
        path: filePath,
        content: content
      });
      
      logger.info(`File written: ${filePath}`);
      return response.data;
    } catch (error) {
      logger.error(`Failed to write file: ${filePath}`, error);
      throw error;
    }
  }

  async listDirectory(directoryPath) {
    try {
      const response = await this.client.post('/mcp/list-directory', {
        path: directoryPath
      });
      
      return response.data;
    } catch (error) {
      logger.error(`Failed to list directory: ${directoryPath}`, error);
      throw error;
    }
  }

  async searchFiles(directoryPath, keywords) {
    try {
      const response = await this.client.post('/mcp/search-files', {
        path: directoryPath,
        keywords: keywords
      });
      
      return response.data.files || [];
    } catch (error) {
      logger.error(`Failed to search files in: ${directoryPath}`, error);
      throw error;
    }
  }

  async searchCode(pattern, directoryPath) {
    try {
      const response = await this.client.post('/mcp/search-code', {
        pattern: pattern,
        path: directoryPath
      });
      
      return response.data;
    } catch (error) {
      logger.error(`Failed to search code pattern: ${pattern}`, error);
      throw error;
    }
  }

  // Command execution
  async executeCommand(command, workingDirectory = null) {
    try {
      const response = await this.client.post('/mcp/execute-command', {
        command: command,
        workingDirectory: workingDirectory
      });
      
      logger.info(`Command executed: ${command}`);
      return response.data;
    } catch (error) {
      logger.error(`Failed to execute command: ${command}`, error);
      throw error;
    }
  }

  // Git operations
  async gitOperation(operation, params = {}) {
    try {
      const response = await this.client.post('/git/operation', {
        operation: operation,
        params: params
      });
      
      logger.info(`Git operation completed: ${operation}`);
      return response.data;
    } catch (error) {
      logger.error(`Failed to execute git operation: ${operation}`, error);
      throw error;
    }
  }

  async createBranch(repositoryPath, branchName, baseBranch = 'main') {
    return await this.gitOperation('create_branch', {
      repositoryPath: repositoryPath,
      branchName: branchName,
      baseBranch: baseBranch
    });
  }

  async checkoutBranch(repositoryPath, branchName) {
    return await this.gitOperation('checkout', {
      repositoryPath: repositoryPath,
      branchName: branchName
    });
  }

  async commitChanges(repositoryPath, message, files = []) {
    try {
      // Add files
      await this.gitOperation('add', {
        repositoryPath: repositoryPath,
        files: files.length > 0 ? files : ['.']
      });
      
      // Commit changes
      return await this.gitOperation('commit', {
        repositoryPath: repositoryPath,
        message: message
      });
    } catch (error) {
      logger.error(`Failed to commit changes: ${message}`, error);
      throw error;
    }
  }

  async pushChanges(repositoryPath, branch = null, remote = 'origin') {
    return await this.gitOperation('push', {
      repositoryPath: repositoryPath,
      branch: branch,
      remote: remote
    });
  }

  async getGitStatus(repositoryPath) {
    return await this.gitOperation('status', {
      repositoryPath: repositoryPath
    });
  }

  async getGitDiff(repositoryPath, staged = false) {
    return await this.gitOperation('diff', {
      repositoryPath: repositoryPath,
      staged: staged
    });
  }

  // Gitea integration
  async createGiteaIssue(owner, repo, title, body, labels = []) {
    try {
      const response = await this.client.post('/gitea/issues', {
        owner: owner,
        repo: repo,
        title: title,
        body: body,
        labels: labels
      });
      
      logger.info(`Gitea issue created: ${owner}/${repo}#${response.data.number}`);
      return response.data;
    } catch (error) {
      logger.error(`Failed to create Gitea issue: ${owner}/${repo}`, error);
      throw error;
    }
  }

  async createGiteaPullRequest(owner, repo, title, body, head, base, labels = []) {
    try {
      const response = await this.client.post('/gitea/pull-requests', {
        owner: owner,
        repo: repo,
        title: title,
        body: body,
        head: head,
        base: base,
        labels: labels
      });
      
      logger.info(`Gitea pull request created: ${owner}/${repo}#${response.data.number}`);
      return response.data;
    } catch (error) {
      logger.error(`Failed to create Gitea pull request: ${owner}/${repo}`, error);
      throw error;
    }
  }

  async addGiteaComment(owner, repo, issueNumber, body) {
    try {
      const response = await this.client.post('/gitea/comments', {
        owner: owner,
        repo: repo,
        issueNumber: issueNumber,
        body: body
      });
      
      logger.info(`Gitea comment added: ${owner}/${repo}#${issueNumber}`);
      return response.data;
    } catch (error) {
      logger.error(`Failed to add Gitea comment: ${owner}/${repo}#${issueNumber}`, error);
      throw error;
    }
  }

  // MCP protocol operations
  async listTools() {
    try {
      const response = await this.client.get('/mcp/tools');
      return response.data.tools || [];
    } catch (error) {
      logger.error('Failed to list MCP tools', error);
      throw error;
    }
  }

  async callTool(toolName, parameters = {}) {
    try {
      const response = await this.client.post('/mcp/call-tool', {
        name: toolName,
        parameters: parameters
      });
      
      logger.info(`MCP tool called: ${toolName}`);
      return response.data;
    } catch (error) {
      logger.error(`Failed to call MCP tool: ${toolName}`, error);
      throw error;
    }
  }

  async getResources() {
    try {
      const response = await this.client.get('/mcp/resources');
      return response.data.resources || [];
    } catch (error) {
      logger.error('Failed to get MCP resources', error);
      throw error;
    }
  }

  async readResource(uri) {
    try {
      const response = await this.client.post('/mcp/read-resource', {
        uri: uri
      });
      
      return response.data;
    } catch (error) {
      logger.error(`Failed to read MCP resource: ${uri}`, error);
      throw error;
    }
  }

  // Utility methods
  async ping() {
    try {
      const response = await this.client.get('/health');
      return response.status === 200;
    } catch (error) {
      return false;
    }
  }

  async getServerInfo() {
    try {
      const response = await this.client.get('/info');
      return response.data;
    } catch (error) {
      logger.error('Failed to get server info', error);
      throw error;
    }
  }

  async getServerMetrics() {
    try {
      const response = await this.client.get('/metrics');
      return response.data;
    } catch (error) {
      logger.error('Failed to get server metrics', error);
      throw error;
    }
  }

  // Error handling helpers
  isNetworkError(error) {
    return error.code === 'ECONNREFUSED' || 
           error.code === 'ENOTFOUND' || 
           error.code === 'ETIMEDOUT';
  }

  isServerError(error) {
    return error.response && error.response.status >= 500;
  }

  isClientError(error) {
    return error.response && error.response.status >= 400 && error.response.status < 500;
  }

  // Retry mechanism for critical operations
  async withRetry(operation, maxRetries = 3, delay = 1000) {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        
        if (attempt === maxRetries) {
          break;
        }
        
        if (this.isNetworkError(error) || this.isServerError(error)) {
          logger.warn(`Operation failed (attempt ${attempt}/${maxRetries}), retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay * attempt));
        } else {
          // Don't retry client errors
          break;
        }
      }
    }
    
    throw lastError;
  }
}

module.exports = new MCPClient();