# Usage Guide: AI Agent Development Environment

This guide provides detailed instructions for using the AI Agent Development Environment with human-in-the-loop workflow via Gitea issues.

## Table of Contents

1. [Getting Started](#getting-started)
2. [Basic Workflows](#basic-workflows)
3. [Human-in-the-Loop](#human-in-the-loop)
4. [Advanced Usage](#advanced-usage)
5. [Best Practices](#best-practices)
6. [Troubleshooting](#troubleshooting)

## Getting Started

### Initial Setup

1. **Start the environment:**
   ```bash
   ./scripts/setup.sh
   ```

2. **Configure API keys in `.env`:**
   ```env
   ANTHROPIC_API_KEY=your_claude_key
   OPENAI_API_KEY=your_openai_key
   ```

3. **Restart agent orchestrator:**
   ```bash
   docker-compose restart agent-orchestrator
   ```

### First Task

Create your first task to test the system:

```bash
curl -X POST http://localhost:9000/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "repository": {
      "url": "https://github.com/octocat/Hello-World.git",
      "branch": "main"
    },
    "description": "Analyze the repository structure and create a summary",
    "agent": "claude",
    "priority": "medium"
  }'
```

## Basic Workflows

### 1. Repository Analysis

**Task:** Analyze a codebase and provide insights

```json
{
  "repository": {
    "url": "https://github.com/user/project.git",
    "branch": "main"
  },
  "description": "Analyze the codebase architecture and identify potential improvements",
  "agent": "claude",
  "additionalContext": "Focus on code quality, performance, and maintainability"
}
```

**Expected Output:**
- Repository structure analysis
- Code quality assessment
- Improvement recommendations
- Architecture documentation

### 2. Feature Implementation

**Task:** Add a new feature to an existing project

```json
{
  "repository": {
    "url": "https://github.com/user/webapp.git",
    "branch": "feature/user-auth"
  },
  "description": "Implement user authentication with JWT tokens",
  "agent": "claude",
  "additionalContext": "Use bcrypt for password hashing, implement middleware for protected routes"
}
```

**Agent Process:**
1. Analyzes existing code structure
2. Identifies authentication patterns
3. Implements JWT authentication system
4. Adds input validation and error handling
5. Creates unit tests
6. Updates documentation

### 3. Bug Fixing

**Task:** Fix a reported bug

```json
{
  "repository": {
    "url": "https://github.com/user/api.git",
    "branch": "bugfix/memory-leak"
  },
  "description": "Fix memory leak in data processing pipeline",
  "agent": "openai",
  "additionalContext": "Issue occurs during large file processing, check connection pooling"
}
```

### 4. Documentation Generation

**Task:** Generate comprehensive documentation

```json
{
  "repository": {
    "url": "https://github.com/user/library.git",
    "branch": "main"
  },
  "description": "Generate API documentation with examples",
  "agent": "claude",
  "additionalContext": "Include code examples, usage patterns, and integration guides"
}
```

## Human-in-the-Loop

### When Human Input is Needed

The agent will request human input in these scenarios:

1. **Ambiguous requirements**
2. **Multiple valid approaches**
3. **Critical decisions affecting architecture**
4. **Error resolution requiring domain knowledge**
5. **Security or compliance considerations**

### Human Input Process

#### 1. Agent Creates Issue

When human input is needed, the agent automatically creates a Gitea issue:

**Example Issue:**
```
Title: [AI Agent] Human Input Required: Authentication Implementation

## 🤖 AI Agent Request for Human Input

### Task Context
- **Current Task**: Implement user authentication with JWT tokens
- **Branch**: feature/user-auth
- **Progress**: Architecture analysis complete

### Current Situation
I've analyzed the existing codebase and found two different authentication patterns already in use. The legacy system uses session-based auth, while the new API endpoints use a custom token system.

### Question/Decision Required
Which authentication approach should I use for the new JWT implementation?

### Available Options
1. Replace the entire authentication system with JWT (breaking change)
2. Add JWT as a third option alongside existing systems
3. Gradually migrate existing endpoints to JWT
4. Create a unified authentication service that supports all methods

### Additional Context
- Legacy system has 50+ endpoints
- New API has 10 endpoints
- Mobile app requires JWT tokens
- Web app currently uses sessions

### Files Involved
- `src/auth/session.js`
- `src/auth/custom-token.js`
- `src/middleware/auth.js`
- `src/routes/api/v1/auth.js`

---

**Instructions for Human:**
Please provide your decision in a comment below using the format:
DECISION: [your choice and reasoning]
```

#### 2. Human Responds

Respond to the issue using structured format:

**Decision Response:**
```
DECISION: Option 3 - Gradually migrate existing endpoints to JWT

Reasoning:
- Minimizes breaking changes for existing users
- Allows testing JWT implementation incrementally
- Provides clear migration path
- Mobile app gets JWT support immediately

Implementation approach:
1. Implement JWT system alongside existing auth
2. Add feature flag for JWT on specific endpoints
3. Create migration guide for developers
4. Plan deprecation timeline for old systems
```

**Code Guidance:**
```
CODE: For the JWT implementation, please:
- Use RS256 algorithm for better security
- Set token expiration to 24 hours
- Include user roles in token payload
- Add refresh token mechanism
- Implement proper token blacklisting for logout
```

**General Guidance:**
```
GUIDANCE: Focus on backward compatibility during implementation. 
Create comprehensive tests for the new JWT system before migrating any existing endpoints.
Document the migration process clearly for other developers.
```

#### 3. Agent Continues

The agent processes the human response and continues:

1. **Parses structured response**
2. **Updates implementation plan**
3. **Continues with guided approach**
4. **May ask follow-up questions if needed**

### Response Formats

#### Decision Format
```
DECISION: [Clear choice] - [Brief reasoning]

[Optional detailed explanation]
```

#### Code Format
```
CODE: [Specific implementation instructions]

[Optional code examples or patterns to follow]
```

#### Guidance Format
```
GUIDANCE: [General advice or direction]

[Optional context or considerations]
```

#### Question Format
```
QUESTION: [Your question about the implementation]

[Optional context for why you're asking]
```

## Advanced Usage

### Custom Agent Configuration

Create custom agent configurations for specific use cases:

```json
{
  "repository": {
    "url": "https://github.com/user/project.git",
    "branch": "main"
  },
  "description": "Optimize database queries for better performance",
  "agent": "claude",
  "configuration": {
    "focus": "performance",
    "constraints": ["no_breaking_changes", "maintain_compatibility"],
    "tools": ["profiler", "query_analyzer"],
    "human_input_threshold": "medium"
  }
}
```

### Batch Operations

Process multiple repositories:

```bash
# Create batch task
curl -X POST http://localhost:9000/tasks/batch \
  -H "Content-Type: application/json" \
  -d '{
    "repositories": [
      {"url": "https://github.com/user/repo1.git", "branch": "main"},
      {"url": "https://github.com/user/repo2.git", "branch": "develop"}
    ],
    "description": "Update all repositories to use latest security practices",
    "agent": "claude"
  }'
```

### Webhook Integration

Set up webhooks for automatic task creation:

```bash
# Configure webhook in Gitea
curl -X POST http://localhost:3001/api/v1/repos/user/repo/hooks \
  -H "Authorization: token $GITEA_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "gitea",
    "config": {
      "url": "http://mcp-git-server:8080/webhooks/gitea",
      "content_type": "json"
    },
    "events": ["issues", "issue_comment", "push"],
    "active": true
  }'
```

### Development Container Usage

Access the development container for manual work:

```bash
# SSH into dev container
ssh developer@localhost -p 2223

# Or use docker exec
docker-compose exec dev-container bash

# Start development server
cd /workspace/repositories/my-project
~/scripts/dev-server.sh node 3000
```

## Best Practices

### Task Description Guidelines

1. **Be Specific:**
   ```
   ❌ "Fix the bug"
   ✅ "Fix memory leak in user data processing that occurs when processing files larger than 100MB"
   ```

2. **Provide Context:**
   ```
   ✅ "Add user authentication using JWT tokens. The app currently has no auth system. 
       Target users are mobile app developers who need API access."
   ```

3. **Include Constraints:**
   ```
   ✅ "Refactor the payment processing module to improve performance. 
       Constraint: Must maintain backward compatibility with existing API."
   ```

### Human Response Guidelines

1. **Be Clear and Decisive:**
   ```
   ❌ "Maybe we should consider option 2, but I'm not sure..."
   ✅ "DECISION: Option 2 - Use TypeScript for better type safety and developer experience"
   ```

2. **Provide Reasoning:**
   ```
   ✅ "DECISION: Implement caching at the database level
       
       Reasoning: Application-level caching would require significant code changes 
       and database-level caching provides better performance with minimal risk."
   ```

3. **Be Specific with Code Instructions:**
   ```
   ❌ "Make it better"
   ✅ "CODE: Use async/await instead of callbacks, add proper error handling with try-catch blocks, 
        and implement input validation using Joi schema"
   ```

### Repository Management

1. **Use Descriptive Branch Names:**
   ```
   ✅ feature/jwt-authentication
   ✅ bugfix/memory-leak-processing
   ✅ docs/api-documentation-update
   ```

2. **Keep Tasks Focused:**
   - One feature per task
   - Clear scope boundaries
   - Manageable complexity

3. **Monitor Progress:**
   ```bash
   # Check task status
   curl http://localhost:9000/tasks/{task-id}
   
   # View logs
   docker-compose logs -f agent-orchestrator
   ```

## Troubleshooting

### Common Issues

#### Agent Not Responding
```bash
# Check agent status
curl http://localhost:9000/health

# Check API keys
grep "API_KEY" .env

# Restart agent
docker-compose restart agent-orchestrator
```

#### Human Input Not Working
```bash
# Check Gitea connectivity
curl http://localhost:3001

# Verify webhook configuration
curl http://localhost:8080/health

# Check issue creation logs
docker-compose logs mcp-git-server | grep "issue"
```

#### Repository Access Issues
```bash
# Check repository permissions
docker-compose exec dev-container git ls-remote https://github.com/user/repo.git

# Verify SSH keys
docker-compose exec dev-container ssh -T git@github.com
```

### Debug Mode

Enable detailed logging:

```bash
# Add to .env
echo "DEBUG=true" >> .env
echo "LOG_LEVEL=debug" >> .env

# Restart services
docker-compose restart
```

### Getting Help

1. **Check service logs:**
   ```bash
   docker-compose logs -f [service-name]
   ```

2. **Verify configuration:**
   ```bash
   # Check environment
   docker-compose config
   
   # Verify API connectivity
   curl -v http://localhost:9000/health
   ```

3. **Reset environment:**
   ```bash
   ./scripts/setup.sh clean
   ./scripts/setup.sh
   ```

4. **Create support issue:**
   - Include error logs
   - Describe expected vs actual behavior
   - Provide task configuration
   - Include environment details

---

For more detailed information, see the main [README.md](README.md) file.