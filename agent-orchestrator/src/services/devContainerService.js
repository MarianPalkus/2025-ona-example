const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const logger = require('../utils/logger');
const util = require('util');

const execAsync = util.promisify(exec);

class DevContainerService {
  constructor() {
    this.activeContainers = new Map();
    this.containerCounter = 0;
  }

  async createAgentContainer(agent, task) {
    try {
      const containerId = `agent-${agent.id}-${++this.containerCounter}`;
      logger.info(`Creating dev container for agent ${agent.id}: ${containerId}`);

      // Determine dev container configuration based on repository
      const devContainerConfig = await this.generateDevContainerConfig(task.repository, agent);
      
      // Create temporary workspace for this agent
      const workspacePath = await this.createAgentWorkspace(containerId, task.repository);
      
      // Write dev container configuration
      await this.writeDevContainerConfig(workspacePath, devContainerConfig);
      
      // Start dev container using @devcontainers/cli
      const container = await this.startDevContainer(containerId, workspacePath, devContainerConfig);
      
      // Store container reference
      this.activeContainers.set(containerId, {
        id: containerId,
        agentId: agent.id,
        taskId: task.id,
        workspacePath: workspacePath,
        container: container,
        config: devContainerConfig,
        createdAt: new Date()
      });

      // Update agent context with container info
      agent.context.devContainer = {
        id: containerId,
        workspacePath: workspacePath,
        execCommand: (cmd) => this.executeInContainer(containerId, cmd)
      };

      logger.info(`Dev container ${containerId} created successfully for agent ${agent.id}`);
      return containerId;

    } catch (error) {
      logger.error(`Failed to create dev container for agent ${agent.id}:`, error);
      throw error;
    }
  }

  async generateDevContainerConfig(repository, agent) {
    // Analyze repository to determine appropriate dev container setup
    const repoAnalysis = await this.analyzeRepository(repository);
    
    const baseConfig = {
      name: `AI Agent Environment - ${agent.id}`,
      image: this.selectBaseImage(repoAnalysis),
      features: this.selectFeatures(repoAnalysis),
      customizations: {
        vscode: {
          extensions: this.selectExtensions(repoAnalysis),
          settings: {
            "terminal.integrated.defaultProfile.linux": "bash",
            "git.autofetch": true,
            "editor.formatOnSave": true
          }
        }
      },
      mounts: [
        "source=/var/run/docker.sock,target=/var/run/docker.sock,type=bind"
      ],
      postCreateCommand: this.generatePostCreateCommand(repoAnalysis),
      remoteUser: "vscode",
      workspaceFolder: "/workspace",
      forwardPorts: this.selectPorts(repoAnalysis)
    };

    return baseConfig;
  }

  async analyzeRepository(repository) {
    try {
      // This would typically clone and analyze the repository
      // For now, we'll use heuristics based on repository URL and known patterns
      const analysis = {
        languages: [],
        frameworks: [],
        packageManagers: [],
        databases: [],
        tools: []
      };

      // Detect languages and frameworks from repository name/URL
      const repoName = repository.url.toLowerCase();
      
      if (repoName.includes('node') || repoName.includes('js') || repoName.includes('react') || repoName.includes('vue')) {
        analysis.languages.push('javascript', 'typescript');
        analysis.packageManagers.push('npm');
        if (repoName.includes('react')) analysis.frameworks.push('react');
        if (repoName.includes('vue')) analysis.frameworks.push('vue');
        if (repoName.includes('next')) analysis.frameworks.push('nextjs');
      }

      if (repoName.includes('python') || repoName.includes('django') || repoName.includes('flask')) {
        analysis.languages.push('python');
        analysis.packageManagers.push('pip');
        if (repoName.includes('django')) analysis.frameworks.push('django');
        if (repoName.includes('flask')) analysis.frameworks.push('flask');
      }

      if (repoName.includes('go') || repoName.includes('golang')) {
        analysis.languages.push('go');
      }

      if (repoName.includes('rust')) {
        analysis.languages.push('rust');
        analysis.packageManagers.push('cargo');
      }

      if (repoName.includes('java') || repoName.includes('spring')) {
        analysis.languages.push('java');
        analysis.packageManagers.push('maven');
        if (repoName.includes('spring')) analysis.frameworks.push('spring');
      }

      if (repoName.includes('docker')) {
        analysis.tools.push('docker');
      }

      if (repoName.includes('k8s') || repoName.includes('kubernetes')) {
        analysis.tools.push('kubernetes');
      }

      // Default to Node.js if no specific language detected
      if (analysis.languages.length === 0) {
        analysis.languages.push('javascript');
        analysis.packageManagers.push('npm');
      }

      return analysis;
    } catch (error) {
      logger.error('Failed to analyze repository:', error);
      return { languages: ['javascript'], packageManagers: ['npm'], frameworks: [], databases: [], tools: [] };
    }
  }

  selectBaseImage(analysis) {
    // Select appropriate base image based on primary language
    if (analysis.languages.includes('python')) {
      return 'mcr.microsoft.com/devcontainers/python:3.11';
    } else if (analysis.languages.includes('go')) {
      return 'mcr.microsoft.com/devcontainers/go:1.21';
    } else if (analysis.languages.includes('rust')) {
      return 'mcr.microsoft.com/devcontainers/rust:latest';
    } else if (analysis.languages.includes('java')) {
      return 'mcr.microsoft.com/devcontainers/java:17';
    } else {
      // Default to Node.js
      return 'mcr.microsoft.com/devcontainers/javascript-node:18';
    }
  }

  selectFeatures(analysis) {
    const features = {
      "ghcr.io/devcontainers/features/common-utils:2": {
        "installZsh": true,
        "configureZshAsDefaultShell": true,
        "installOhMyZsh": true
      },
      "ghcr.io/devcontainers/features/git:1": {
        "ppa": true,
        "version": "latest"
      },
      "ghcr.io/devcontainers/features/docker-in-docker:2": {
        "version": "latest",
        "enableNonRootDocker": true
      }
    };

    // Add language-specific features
    if (analysis.languages.includes('python')) {
      features["ghcr.io/devcontainers/features/python:1"] = {
        "version": "3.11",
        "installTools": true
      };
    }

    if (analysis.languages.includes('go')) {
      features["ghcr.io/devcontainers/features/go:1"] = {
        "version": "1.21"
      };
    }

    if (analysis.languages.includes('rust')) {
      features["ghcr.io/devcontainers/features/rust:1"] = {
        "version": "latest",
        "profile": "default"
      };
    }

    if (analysis.languages.includes('java')) {
      features["ghcr.io/devcontainers/features/java:1"] = {
        "version": "17",
        "installMaven": true,
        "installGradle": true
      };
    }

    if (analysis.tools.includes('kubernetes')) {
      features["ghcr.io/devcontainers/features/kubectl-helm-minikube:1"] = {
        "version": "latest"
      };
    }

    return features;
  }

  selectExtensions(analysis) {
    const extensions = [
      "ms-vscode.vscode-json",
      "ms-vscode.vscode-yaml",
      "redhat.vscode-xml",
      "ms-vscode.vscode-markdown",
      "eamodio.gitlens",
      "ms-vscode.vscode-git-graph",
      "streetsidesoftware.code-spell-checker"
    ];

    // Add language-specific extensions
    if (analysis.languages.includes('javascript') || analysis.languages.includes('typescript')) {
      extensions.push(
        "ms-vscode.vscode-typescript-next",
        "ms-vscode.vscode-eslint",
        "esbenp.prettier-vscode",
        "bradlc.vscode-tailwindcss"
      );
    }

    if (analysis.frameworks.includes('react')) {
      extensions.push("ms-vscode.vscode-react-refactor");
    }

    if (analysis.languages.includes('python')) {
      extensions.push(
        "ms-python.python",
        "ms-python.pylint",
        "ms-python.black-formatter",
        "ms-python.isort"
      );
    }

    if (analysis.languages.includes('go')) {
      extensions.push("golang.go");
    }

    if (analysis.languages.includes('rust')) {
      extensions.push("rust-lang.rust-analyzer");
    }

    if (analysis.languages.includes('java')) {
      extensions.push(
        "redhat.java",
        "vscjava.vscode-java-pack"
      );
    }

    if (analysis.tools.includes('docker')) {
      extensions.push("ms-azuretools.vscode-docker");
    }

    if (analysis.tools.includes('kubernetes')) {
      extensions.push("ms-kubernetes-tools.vscode-kubernetes-tools");
    }

    return extensions;
  }

  generatePostCreateCommand(analysis) {
    const commands = [];

    // Update package lists
    commands.push('sudo apt-get update');

    // Install additional tools based on analysis
    if (analysis.packageManagers.includes('npm')) {
      commands.push('npm install -g typescript ts-node nodemon');
    }

    if (analysis.packageManagers.includes('pip')) {
      commands.push('pip install --upgrade pip setuptools wheel');
    }

    // Configure git (will be overridden by agent-specific config)
    commands.push('git config --global init.defaultBranch main');
    commands.push('git config --global pull.rebase false');

    return commands.join(' && ');
  }

  selectPorts(analysis) {
    const ports = [3000, 8000]; // Common development ports

    if (analysis.frameworks.includes('react')) {
      ports.push(3000, 3001);
    }

    if (analysis.frameworks.includes('vue')) {
      ports.push(8080, 8081);
    }

    if (analysis.frameworks.includes('django')) {
      ports.push(8000, 8001);
    }

    if (analysis.frameworks.includes('flask')) {
      ports.push(5000, 5001);
    }

    if (analysis.frameworks.includes('spring')) {
      ports.push(8080, 8090);
    }

    return [...new Set(ports)]; // Remove duplicates
  }

  async createAgentWorkspace(containerId, repository) {
    const workspacePath = path.join('/tmp', 'agent-workspaces', containerId);
    
    try {
      await fs.mkdir(workspacePath, { recursive: true });
      
      // Create .devcontainer directory
      const devcontainerDir = path.join(workspacePath, '.devcontainer');
      await fs.mkdir(devcontainerDir, { recursive: true });
      
      logger.info(`Created workspace directory: ${workspacePath}`);
      return workspacePath;
    } catch (error) {
      logger.error(`Failed to create workspace directory: ${workspacePath}`, error);
      throw error;
    }
  }

  async writeDevContainerConfig(workspacePath, config) {
    const configPath = path.join(workspacePath, '.devcontainer', 'devcontainer.json');
    
    try {
      await fs.writeFile(configPath, JSON.stringify(config, null, 2));
      logger.info(`Written dev container config to: ${configPath}`);
    } catch (error) {
      logger.error(`Failed to write dev container config: ${configPath}`, error);
      throw error;
    }
  }

  async startDevContainer(containerId, workspacePath, config) {
    try {
      logger.info(`Starting dev container: ${containerId}`);
      
      // Use @devcontainers/cli to start the container
      const command = `devcontainer up --workspace-folder "${workspacePath}" --id-label "agent-container=${containerId}"`;
      
      const { stdout, stderr } = await execAsync(command, {
        cwd: workspacePath,
        timeout: 300000 // 5 minutes timeout
      });
      
      if (stderr && !stderr.includes('WARNING')) {
        logger.warn(`Dev container startup warnings: ${stderr}`);
      }
      
      logger.info(`Dev container ${containerId} started successfully`);
      
      // Parse container info from output
      const containerInfo = this.parseContainerInfo(stdout);
      
      return {
        id: containerId,
        dockerContainerId: containerInfo.dockerId,
        status: 'running',
        startedAt: new Date()
      };
      
    } catch (error) {
      logger.error(`Failed to start dev container ${containerId}:`, error);
      throw error;
    }
  }

  parseContainerInfo(output) {
    // Parse devcontainer CLI output to extract container information
    const lines = output.split('\n');
    let dockerId = null;
    
    for (const line of lines) {
      if (line.includes('Container ID:')) {
        dockerId = line.split('Container ID:')[1].trim();
        break;
      }
    }
    
    return { dockerId };
  }

  async executeInContainer(containerId, command, options = {}) {
    try {
      const containerInfo = this.activeContainers.get(containerId);
      if (!containerInfo) {
        throw new Error(`Container ${containerId} not found`);
      }

      logger.info(`Executing in container ${containerId}: ${command}`);
      
      // Use devcontainer exec to run command in the container
      const execCommand = `devcontainer exec --workspace-folder "${containerInfo.workspacePath}" -- ${command}`;
      
      const { stdout, stderr } = await execAsync(execCommand, {
        cwd: containerInfo.workspacePath,
        timeout: options.timeout || 60000,
        env: { ...process.env, ...options.env }
      });
      
      const result = {
        command: command,
        stdout: stdout,
        stderr: stderr,
        exitCode: 0,
        executedAt: new Date()
      };
      
      logger.info(`Command executed successfully in container ${containerId}`);
      return result;
      
    } catch (error) {
      logger.error(`Failed to execute command in container ${containerId}:`, error);
      
      return {
        command: command,
        stdout: '',
        stderr: error.message,
        exitCode: error.code || 1,
        executedAt: new Date(),
        error: error.message
      };
    }
  }

  async cloneRepositoryInContainer(containerId, repositoryUrl, branch = 'main') {
    try {
      const containerInfo = this.activeContainers.get(containerId);
      if (!containerInfo) {
        throw new Error(`Container ${containerId} not found`);
      }

      // Clone repository into the container workspace
      const cloneCommand = `git clone --branch ${branch} ${repositoryUrl} /workspace/repository`;
      const result = await this.executeInContainer(containerId, cloneCommand);
      
      if (result.exitCode !== 0) {
        throw new Error(`Failed to clone repository: ${result.stderr}`);
      }
      
      // Set working directory to the cloned repository
      containerInfo.repositoryPath = '/workspace/repository';
      
      logger.info(`Repository cloned successfully in container ${containerId}`);
      return '/workspace/repository';
      
    } catch (error) {
      logger.error(`Failed to clone repository in container ${containerId}:`, error);
      throw error;
    }
  }

  async installDependencies(containerId, packageManager = 'npm') {
    try {
      let installCommand;
      
      switch (packageManager) {
        case 'npm':
          installCommand = 'cd /workspace/repository && npm install';
          break;
        case 'yarn':
          installCommand = 'cd /workspace/repository && yarn install';
          break;
        case 'pip':
          installCommand = 'cd /workspace/repository && pip install -r requirements.txt';
          break;
        case 'cargo':
          installCommand = 'cd /workspace/repository && cargo build';
          break;
        case 'maven':
          installCommand = 'cd /workspace/repository && mvn install';
          break;
        case 'gradle':
          installCommand = 'cd /workspace/repository && ./gradlew build';
          break;
        default:
          throw new Error(`Unsupported package manager: ${packageManager}`);
      }
      
      const result = await this.executeInContainer(containerId, installCommand, { timeout: 300000 });
      
      if (result.exitCode !== 0) {
        logger.warn(`Dependency installation had issues: ${result.stderr}`);
      }
      
      logger.info(`Dependencies installed in container ${containerId}`);
      return result;
      
    } catch (error) {
      logger.error(`Failed to install dependencies in container ${containerId}:`, error);
      throw error;
    }
  }

  async runTests(containerId, testCommand = 'npm test') {
    try {
      const command = `cd /workspace/repository && ${testCommand}`;
      const result = await this.executeInContainer(containerId, command, { timeout: 180000 });
      
      logger.info(`Tests executed in container ${containerId}`);
      return result;
      
    } catch (error) {
      logger.error(`Failed to run tests in container ${containerId}:`, error);
      throw error;
    }
  }

  async stopContainer(containerId) {
    try {
      const containerInfo = this.activeContainers.get(containerId);
      if (!containerInfo) {
        logger.warn(`Container ${containerId} not found for stopping`);
        return;
      }

      logger.info(`Stopping dev container: ${containerId}`);
      
      // Stop the dev container
      const command = `devcontainer stop --workspace-folder "${containerInfo.workspacePath}"`;
      await execAsync(command, { cwd: containerInfo.workspacePath });
      
      // Clean up workspace directory
      await fs.rmdir(containerInfo.workspacePath, { recursive: true });
      
      // Remove from active containers
      this.activeContainers.delete(containerId);
      
      logger.info(`Dev container ${containerId} stopped and cleaned up`);
      
    } catch (error) {
      logger.error(`Failed to stop container ${containerId}:`, error);
      throw error;
    }
  }

  async getContainerStatus(containerId) {
    const containerInfo = this.activeContainers.get(containerId);
    if (!containerInfo) {
      return { status: 'not_found' };
    }
    
    try {
      // Check if container is still running
      const command = `devcontainer exec --workspace-folder "${containerInfo.workspacePath}" -- echo "alive"`;
      await execAsync(command, { cwd: containerInfo.workspacePath, timeout: 5000 });
      
      return {
        status: 'running',
        id: containerId,
        agentId: containerInfo.agentId,
        taskId: containerInfo.taskId,
        createdAt: containerInfo.createdAt,
        workspacePath: containerInfo.workspacePath
      };
      
    } catch (error) {
      return {
        status: 'stopped',
        id: containerId,
        error: error.message
      };
    }
  }

  async listActiveContainers() {
    const containers = [];
    
    for (const [containerId, containerInfo] of this.activeContainers) {
      const status = await this.getContainerStatus(containerId);
      containers.push(status);
    }
    
    return containers;
  }

  async cleanupStaleContainers() {
    logger.info('Cleaning up stale containers...');
    
    const staleContainers = [];
    for (const [containerId, containerInfo] of this.activeContainers) {
      const status = await this.getContainerStatus(containerId);
      if (status.status !== 'running') {
        staleContainers.push(containerId);
      }
    }
    
    for (const containerId of staleContainers) {
      try {
        await this.stopContainer(containerId);
      } catch (error) {
        logger.error(`Failed to cleanup stale container ${containerId}:`, error);
      }
    }
    
    logger.info(`Cleaned up ${staleContainers.length} stale containers`);
  }
}

module.exports = new DevContainerService();