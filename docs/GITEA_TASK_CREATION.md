# Creating AI Agent Tasks via Gitea Issues

This guide explains how to create AI agent tasks directly through Gitea issues using special labels, assignees, and formatting.

## 🎯 Quick Start

### Method 1: Issue Labels

Create a new issue in any Gitea repository with these labels:

**Required Labels:**
- `ai-agent-task` or `ai-task` or `agent-task`

**Agent Selection Labels:**
- `claude` or `anthropic` - Use Claude agent
- `openai` or `gpt` - Use OpenAI agent

**Priority Labels (optional):**
- `priority-high` or `urgent`
- `priority-medium` (default)
- `priority-low`

### Method 2: Title Prefix

Start your issue title with:
- `[AI-TASK]` or `[AGENT]`

### Method 3: Special Assignee

Assign the issue to:
- `@ai-agent-claude` - For Claude tasks
- `@ai-agent-openai` - For OpenAI tasks

## 📝 Issue Format

### Basic Task Issue

```markdown
Title: [AI-TASK] Add user authentication to the API

Labels: ai-agent-task, claude, priority-medium

## Task Description
Implement JWT-based user authentication for the REST API.

## Requirements
- Use bcrypt for password hashing
- Implement login/logout endpoints
- Add middleware for protected routes
- Include input validation
- Add comprehensive tests

## Repository
Repository: https://github.com/myorg/api-server.git
Branch: feature/auth

## Additional Context
The API currently has no authentication. We need to secure endpoints 
for user data access. Follow existing code patterns in the project.
```

### Advanced Task Issue

```markdown
Title: Fix memory leak in data processing pipeline

Labels: ai-agent-task, openai, priority-high, bug

## Problem Description
Memory usage continuously increases during large file processing operations.
The issue appears to be related to connection pooling or stream handling.

## Expected Outcome
- Identify root cause of memory leak
- Implement fix without breaking existing functionality
- Add monitoring to prevent future occurrences
- Update documentation with best practices

## Repository
Repository: https://github.com/myorg/data-processor.git
Branch: bugfix/memory-leak

## Constraints
- Must maintain backward compatibility
- No breaking changes to public API
- Performance should not degrade

## Files to Focus On
- `src/processors/fileProcessor.js`
- `src/utils/connectionPool.js`
- `src/streams/dataStream.js`

## Testing Requirements
- Add memory usage tests
- Verify fix with large datasets (>1GB)
- Ensure no regression in processing speed
```

## 🤖 Automatic Task Creation

When you create an issue with the proper labels/format:

1. **Webhook triggers** - Gitea sends webhook to MCP server
2. **Issue parsed** - System extracts task details
3. **Task created** - Agent orchestrator receives task
4. **Confirmation comment** - Bot adds status comment to issue

### Example Confirmation Comment

```markdown
## 🤖 AI Agent Task Created

**Task ID**: `task-abc123`
**Agent**: claude
**Priority**: medium
**Status**: queued

### Task Details
Add user authentication to the API

### Repository
- **URL**: https://github.com/myorg/api-server.git
- **Branch**: feature/auth

### Monitoring
- **Task Status**: [View Details](http://localhost:9000/tasks/task-abc123)
- **Agent Dashboard**: [Open Dashboard](http://localhost:4000/tasks/task-abc123)

---
*This task was automatically created from this issue. The AI agent will begin work shortly.*

**Available Commands:**
- `@agent pause` - Pause the current task
- `@agent resume` - Resume a paused task  
- `@agent status` - Get current task status
- `@agent cancel` - Cancel the task
```

## 🎮 Agent Commands

Once a task is created, you can control it via comments:

### Status Check
```
@agent status
```

### Pause/Resume
```
@agent pause
@agent resume
```

### Cancel Task
```
@agent cancel
```

### Example Command Usage

```markdown
The approach looks good, but let's pause while I review the security implications.

@agent pause
```

## 🔄 Human-in-the-Loop Workflow

### When Agent Needs Input

The agent will create a **new issue** or **comment** when it needs human guidance:

```markdown
## 🤖 AI Agent Request for Human Input

### Task Context
- **Current Task**: Add user authentication to the API
- **Branch**: feature/auth
- **Progress**: Architecture analysis complete

### Current Situation
I've analyzed the existing codebase and found two different authentication 
patterns already in use. The legacy system uses session-based auth, while 
the new API endpoints use a custom token system.

### Question/Decision Required
Which authentication approach should I use for the new JWT implementation?

### Available Options
1. Replace the entire authentication system with JWT (breaking change)
2. Add JWT as a third option alongside existing systems
3. Gradually migrate existing endpoints to JWT
4. Create a unified authentication service that supports all methods

### Files Involved
- `src/auth/session.js`
- `src/auth/custom-token.js`
- `src/middleware/auth.js`
```

### Human Response Format

Respond using structured prefixes:

```markdown
DECISION: Option 3 - Gradually migrate existing endpoints to JWT

Reasoning: This minimizes breaking changes for existing users while allowing 
us to test the JWT implementation incrementally.

CODE: For the JWT implementation:
- Use RS256 algorithm for better security
- Set token expiration to 24 hours
- Include user roles in token payload
- Add refresh token mechanism

GUIDANCE: Focus on backward compatibility during implementation. Create 
comprehensive tests for the new JWT system before migrating any existing endpoints.
```

## 📋 Issue Templates

### Feature Implementation Template

```markdown
---
name: AI Agent Feature Request
about: Request an AI agent to implement a new feature
title: '[AI-TASK] '
labels: 'ai-agent-task, claude, priority-medium'
assignees: ''
---

## Feature Description
<!-- Describe what feature should be implemented -->

## Requirements
<!-- List specific requirements and acceptance criteria -->
- [ ] Requirement 1
- [ ] Requirement 2
- [ ] Requirement 3

## Repository Information
Repository: <!-- Git repository URL -->
Branch: <!-- Target branch (optional, defaults to main) -->

## Technical Specifications
<!-- Any technical constraints or specifications -->

## Additional Context
<!-- Any additional context, examples, or references -->
```

### Bug Fix Template

```markdown
---
name: AI Agent Bug Fix
about: Request an AI agent to fix a bug
title: '[AI-TASK] Fix: '
labels: 'ai-agent-task, openai, priority-high, bug'
assignees: ''
---

## Bug Description
<!-- Describe the bug and its impact -->

## Steps to Reproduce
1. <!-- Step 1 -->
2. <!-- Step 2 -->
3. <!-- Step 3 -->

## Expected Behavior
<!-- What should happen -->

## Actual Behavior
<!-- What actually happens -->

## Repository Information
Repository: <!-- Git repository URL -->
Branch: <!-- Branch where bug exists -->

## Error Logs
<!-- Include relevant error logs or stack traces -->

## Additional Context
<!-- Any additional context about the bug -->
```

### Code Review Template

```markdown
---
name: AI Agent Code Review
about: Request an AI agent to review code
title: '[AI-TASK] Review: '
labels: 'ai-agent-task, claude, priority-medium, review'
assignees: ''
---

## Review Scope
<!-- What should be reviewed -->

## Focus Areas
<!-- Specific areas to focus on -->
- [ ] Code quality
- [ ] Performance
- [ ] Security
- [ ] Documentation
- [ ] Test coverage

## Repository Information
Repository: <!-- Git repository URL -->
Branch: <!-- Branch to review -->

## Specific Files/Directories
<!-- List specific files or directories to review -->

## Review Criteria
<!-- Any specific criteria or standards to apply -->
```

## 🏷️ Label Management

### Automatic Labels

The system automatically adds these labels to task issues:

- `ai-agent-active` - Agent is currently working
- `agent-{type}` - Which agent is assigned (claude/openai)
- `priority-{level}` - Task priority level
- `task-{id}` - Unique task identifier

### Custom Labels

You can create custom labels for organization:

- `team-backend` - Backend team tasks
- `team-frontend` - Frontend team tasks
- `epic-auth` - Authentication epic tasks
- `sprint-current` - Current sprint tasks

## 🔧 Configuration

### Repository Settings

Enable webhooks in your Gitea repository:

1. Go to **Settings** → **Webhooks**
2. Add webhook URL: `http://mcp-git-server:8080/webhooks/gitea`
3. Select events: `Issues`, `Issue Comments`, `Push`, `Pull Requests`
4. Set secret to match `GITEA_WEBHOOK_SECRET` in `.env`

### Issue Templates

Add issue templates to `.gitea/issue_template/` in your repository:

```
.gitea/
└── issue_template/
    ├── ai_feature.md
    ├── ai_bugfix.md
    └── ai_review.md
```

## 📊 Monitoring Tasks

### Via Gitea

- **Issue comments** - Real-time updates from agent
- **Label changes** - Status updates via labels
- **Issue status** - Open/closed reflects task status

### Via Web Dashboard

- **Task list**: http://localhost:4000/tasks
- **Task details**: http://localhost:4000/tasks/{task-id}
- **Agent status**: http://localhost:4000/agents

### Via API

```bash
# List tasks created from Gitea issues
curl "http://localhost:9000/tasks?source=gitea_issue"

# Get task by source issue
curl "http://localhost:9000/tasks?issue_number=123&repository=myorg/repo"
```

## 🚨 Troubleshooting

### Task Not Created

1. **Check labels** - Ensure `ai-agent-task` label is present
2. **Verify webhook** - Check webhook configuration in repository settings
3. **Check logs** - View MCP server logs: `docker-compose logs mcp-git-server`

### Agent Not Responding

1. **Check task status** - Use `@agent status` command
2. **Verify API keys** - Ensure Claude/OpenAI keys are configured
3. **Check orchestrator** - View logs: `docker-compose logs agent-orchestrator`

### Human Input Not Working

1. **Response format** - Use `DECISION:`, `CODE:`, `GUIDANCE:` prefixes
2. **Issue labels** - Ensure issue has `human-input-required` label
3. **Webhook events** - Verify issue comment webhooks are enabled

## 💡 Best Practices

### Issue Titles
- Be specific and actionable
- Include context about the change type
- Use consistent prefixes for organization

### Task Descriptions
- Provide clear requirements and acceptance criteria
- Include relevant technical constraints
- Reference related issues or documentation

### Repository Information
- Always specify the target repository
- Include branch information for non-main branches
- Mention specific files or directories when relevant

### Human Responses
- Be decisive and clear in your guidance
- Provide reasoning for decisions
- Include specific technical requirements when needed

---

This Gitea-based task creation provides a seamless way to integrate AI agents into your existing development workflow while maintaining full visibility and control through familiar issue tracking.