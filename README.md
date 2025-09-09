# AI Agent Development Environment

A comprehensive Docker Compose-based setup for AI agents (Claude, OpenAI) to work on Git repositories via MCP (Model Context Protocol) servers with integrated human-in-the-loop workflow through Gitea issues.

## 🏗️ Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Web UI        │    │ Agent            │    │ MCP Git         │
│   (Port 4000)   │◄──►│ Orchestrator     │◄──►│ Server          │
│                 │    │ (Port 9000)      │    │ (Port 8080)     │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                │                        │
                                ▼                        ▼
                       ┌─────────────────┐    ┌─────────────────┐
                       │ Dev Container   │    │ Gitea Server    │
                       │ (SSH: 2223)     │    │ (Port 3001)     │
                       │ (Ports 3000+)   │    │ Issues & Repos  │
                       └─────────────────┘    └─────────────────┘
                                │                        │
                                ▼                        ▼
                       ┌─────────────────┐    ┌─────────────────┐
                       │ Shared          │    │ Human-in-Loop   │
                       │ Repositories    │    │ via Issues      │
                       │ Volume          │    │ & Comments      │
                       └─────────────────┘    └─────────────────┘
```

## 🚀 Quick Start

### Prerequisites

- Docker & Docker Compose
- At least 4GB RAM available
- API keys for Claude (Anthropic) and/or OpenAI

### 1. Clone and Setup

```bash
git clone <this-repository>
cd ai-agent-dev-env
./scripts/setup.sh
```

The setup script will:
- Create necessary directories
- Generate security secrets
- Build Docker images
- Initialize Gitea with admin user
- Start all services
- Verify installation

### 2. Configure API Keys

Edit `.env` file with your API keys:

```bash
# Required: At least one AI provider
ANTHROPIC_API_KEY=your_claude_api_key_here
OPENAI_API_KEY=your_openai_api_key_here
```

### 3. Restart Services

```bash
docker-compose restart agent-orchestrator
```

### 4. Access Services

- **Web UI**: [http://localhost:4000](http://localhost:4000)
- **Gitea**: [http://localhost:3001](http://localhost:3001) (admin/admin123)
- **Agent API**: [http://localhost:9000](http://localhost:9000)
- **Dev Container**: `ssh developer@localhost -p 2223` (password: developer)

## 🤖 Usage

### Creating a Task

#### Via Gitea Issues (Recommended)

Create an issue in any Gitea repository with special labels:

```markdown
Title: [AI-TASK] Add user authentication to the API

Labels: ai-agent-task, claude, priority-medium

## Task Description
Implement JWT-based user authentication for the REST API.

## Repository
Repository: https://github.com/myorg/api-server.git
Branch: feature/auth

## Requirements
- Use bcrypt for password hashing
- Implement login/logout endpoints
- Add middleware for protected routes
```

**Required Labels:**
- `ai-agent-task` - Marks issue as AI task
- `claude` or `openai` - Selects agent type
- `priority-high/medium/low` - Sets priority

#### Via API

```bash
curl -X POST http://localhost:9000/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "repository": {
      "url": "https://github.com/user/repo.git",
      "branch": "main"
    },
    "description": "Add unit tests for the authentication module",
    "agent": "claude",
    "priority": "medium"
  }'
```

#### Via Web UI

1. Open [http://localhost:4000](http://localhost:4000)
2. Click "New Task"
3. Fill in repository URL and task description
4. Select agent type (Claude or OpenAI)
5. Submit task

### Human-Like Development Workflow

AI agents work like human developers, following proper development practices:

#### 1. **Requirements Analysis**
- Agent analyzes task requirements
- Asks clarifying questions if unclear
- Waits for human clarification before proceeding

#### 2. **Implementation Planning**
- Creates detailed implementation plan
- Requests verification for complex changes
- Gets human approval before coding

#### 3. **Development Process**
- Creates feature branch with descriptive name
- Implements changes following approved plan
- Adds comprehensive tests
- Follows existing code patterns

#### 4. **Pull Request & Review**
- Creates detailed pull request
- Links to original issue
- Waits for human code review
- Responds to review feedback
- Makes requested changes

#### 5. **Merge & Completion**
- Human approves and merges PR
- Agent updates task status
- Cleans up if configured

#### Agent Commands

Control agents via issue comments:

```
@agent status    # Check current task status
@agent pause     # Pause the current task
@agent resume    # Resume a paused task
@agent cancel    # Cancel the task
```

#### Response Format

Use these prefixes in issue comments for structured responses:

```
DECISION: Choose option 2 - use TypeScript for better type safety
CODE: Add error handling with try-catch blocks
GUIDANCE: Focus on performance optimization first
APPROVAL: Yes, proceed with this implementation plan
```

**See detailed workflow:** [Development Workflow Guide](docs/DEVELOPMENT_WORKFLOW.md)

### Repository Management

#### Clone Repository

```bash
curl -X POST http://localhost:8080/git/clone \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://github.com/user/repo.git",
    "branch": "main"
  }'
```

#### Create Repository in Gitea

```bash
curl -X POST http://localhost:8080/gitea/repositories \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-project",
    "description": "AI agent managed project",
    "private": false
  }'
```

## 🔧 Configuration

### Environment Variables

Key configuration options in `.env`:

```env
# AI Providers
ANTHROPIC_API_KEY=your_key
OPENAI_API_KEY=your_key

# Agent Behavior
MAX_CONCURRENT_TASKS=5
TASK_TIMEOUT_MINUTES=60
HUMAN_INPUT_TIMEOUT_HOURS=24
AUTO_COMMIT_ENABLED=false

# Rate Limiting
ANTHROPIC_RATE_LIMIT_RPM=50
OPENAI_RATE_LIMIT_RPM=60
```

### Agent Capabilities

#### Claude Agent
- Advanced reasoning and planning
- Code architecture analysis
- Documentation generation
- Complex problem solving

#### OpenAI Agent
- Code completion and suggestions
- Bug detection and fixes
- Performance optimization
- API integration

### Development Container

Pre-configured with:
- **Languages**: Node.js 18, Python 3.11, Go 1.21, Rust, Java 17
- **Tools**: Git, Docker CLI, development servers
- **Package Managers**: npm, pip, cargo, maven
- **SSH Access**: Port 2223 (developer/developer)

## 📊 Monitoring

### Service Health

```bash
# Check all services
curl http://localhost:9000/health

# Individual service status
docker-compose ps
```

### Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f agent-orchestrator
docker-compose logs -f mcp-git-server
```

### Task Status

```bash
# List active tasks
curl http://localhost:9000/tasks

# Get task details
curl http://localhost:9000/tasks/{task-id}
```

## 🔄 Workflow Examples

### Example 1: Add Feature

```json
{
  "repository": {
    "url": "https://github.com/myorg/webapp.git",
    "branch": "main"
  },
  "description": "Add user authentication with JWT tokens",
  "agent": "claude",
  "additionalContext": "Use bcrypt for password hashing, implement login/logout endpoints"
}
```

**Agent Process:**
1. Analyzes requirements and asks clarifying questions
2. Creates implementation plan and requests verification
3. Creates feature branch: `feature/jwt-authentication`
4. Implements JWT authentication following approved plan
5. Adds comprehensive tests and documentation
6. Creates pull request for human review
7. Responds to review feedback and makes changes
8. Waits for human approval and merge

### Example 2: Bug Fix with Human Input

```json
{
  "repository": {
    "url": "https://github.com/myorg/api.git",
    "branch": "bugfix/memory-leak"
  },
  "description": "Fix memory leak in data processing pipeline",
  "agent": "openai"
}
```

**Workflow:**
1. Agent analyzes code and identifies potential issues
2. Finds multiple possible causes
3. Creates Gitea issue: "Need guidance on memory leak fix approach"
4. Human reviews and comments: "DECISION: Focus on the connection pooling issue first"
5. Agent creates bugfix branch: `bugfix/memory-leak-connection-pool`
6. Implements fix based on human guidance
7. Adds tests to prevent regression
8. Creates pull request with detailed explanation
9. Human reviews, approves, and merges

### Example 3: Documentation Generation

```json
{
  "repository": {
    "url": "https://github.com/myorg/library.git",
    "branch": "main"
  },
  "description": "Generate comprehensive API documentation",
  "agent": "claude",
  "additionalContext": "Include code examples and usage patterns"
}
```

## 🛠️ Development

### Adding Custom Tools

1. **MCP Server Tools**: Add to `mcp-server/src/tools/`
2. **Agent Capabilities**: Extend `agent-orchestrator/src/services/agentService.js`
3. **Web UI Components**: Add to `web-ui/src/components/`

### Custom Agent Types

```javascript
// agent-orchestrator/src/services/agentService.js
getAgentCapabilities(type) {
  const capabilities = {
    'custom-agent': [
      'specialized_capability',
      'domain_specific_analysis'
    ]
  };
  return [...baseCapabilities, ...capabilities[type]];
}
```

### Environment Customization

```yaml
# docker-compose.override.yml
services:
  dev-container:
    volumes:
      - ./custom-tools:/home/developer/tools
    environment:
      - CUSTOM_ENV_VAR=value
```

## 🔒 Security

### Best Practices

1. **API Keys**: Store in `.env`, never commit to repository
2. **Network**: Services isolated in Docker network
3. **Authentication**: Gitea provides user management
4. **Secrets**: Auto-generated JWT and webhook secrets

### Access Control

- **Gitea**: User-based repository access
- **Agent API**: Optional JWT authentication
- **Dev Container**: SSH key-based access recommended

## 🚨 Troubleshooting

### Common Issues

#### Services Won't Start

```bash
# Check logs
docker-compose logs

# Rebuild images
docker-compose build --no-cache

# Reset environment
./scripts/setup.sh clean
./scripts/setup.sh
```

#### Agent Tasks Fail

1. **Check API keys**: Verify in `.env` file
2. **Check rate limits**: Monitor API usage
3. **Check repository access**: Ensure Git credentials are correct

#### Human Input Not Working

1. **Verify Gitea**: Check if accessible at localhost:3001
2. **Check webhooks**: Verify webhook configuration
3. **Review issue format**: Ensure proper response format

### Debug Mode

```bash
# Enable debug logging
echo "DEBUG=true" >> .env
docker-compose restart
```

### Reset Environment

```bash
# Complete reset
./scripts/setup.sh clean
./scripts/setup.sh
```

## 📋 Task Creation Methods

### 1. Gitea Issues (Recommended)

The most natural way to create tasks using your existing workflow:

**Quick Example:**
```markdown
Title: [AI-TASK] Fix memory leak in data processor

Labels: ai-agent-task, openai, priority-high

Repository: https://github.com/myorg/processor.git
Branch: bugfix/memory-leak

The memory usage increases during large file processing...
```

**See detailed guide:** [Gitea Task Creation](docs/GITEA_TASK_CREATION.md)

### 2. Special Assignees

Assign issues to AI agent users:
- `@ai-agent-claude` - Creates Claude task
- `@ai-agent-openai` - Creates OpenAI task

### 3. Issue Templates

Use `.gitea/issue_template/` for consistent task creation:
- `ai_feature.md` - Feature implementation
- `ai_bugfix.md` - Bug fixes  
- `ai_review.md` - Code reviews

## 📚 API Reference

### Agent Orchestrator API

#### Create Task
```http
POST /tasks
Content-Type: application/json

{
  "repository": {
    "url": "string",
    "branch": "string"
  },
  "description": "string",
  "agent": "claude|openai",
  "priority": "low|medium|high",
  "additionalContext": "string"
}
```

#### Get Task Status
```http
GET /tasks/{taskId}
```

#### List Tasks
```http
GET /tasks?status=active&agent=claude
```

### MCP Server API

#### Clone Repository
```http
POST /git/clone
Content-Type: application/json

{
  "url": "string",
  "branch": "string"
}
```

#### Execute Git Operation
```http
POST /git/operation
Content-Type: application/json

{
  "operation": "commit|push|pull",
  "params": {}
}
```

### Gitea Integration

#### Create Issue
```http
POST /gitea/issues
Content-Type: application/json

{
  "owner": "string",
  "repo": "string",
  "title": "string",
  "body": "string",
  "labels": ["array"]
}
```

## 🤝 Contributing

1. Fork the repository
2. Create feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open pull request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Anthropic](https://anthropic.com) for Claude API
- [OpenAI](https://openai.com) for GPT API
- [Gitea](https://gitea.io) for Git hosting
- [Model Context Protocol](https://modelcontextprotocol.io) for agent communication

---

**Need help?** Create an issue in this repository or check the troubleshooting section above.
