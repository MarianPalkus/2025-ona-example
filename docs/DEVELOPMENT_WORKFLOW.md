# AI Agent Development Workflow

This document describes how AI agents work like human developers, following proper development practices including asking questions, creating branches, pull requests, and responding to code reviews.

## 🔄 Complete Development Lifecycle

### 1. Requirements Analysis & Clarification

When an AI agent receives a task, it first analyzes the requirements and asks clarifying questions if needed.

#### Agent Behavior:
- **Analyzes task description** for completeness and clarity
- **Identifies ambiguous requirements** that need clarification
- **Creates clarification issue** in Gitea if questions arise
- **Waits for human response** before proceeding

#### Example Clarification Request:

```markdown
## 🤖 AI Agent Clarification Request

I'm working on implementing user authentication but need clarification:

### Questions for Clarification

1. Should I use JWT tokens or session-based authentication?
2. What user roles need to be supported (admin, user, guest)?
3. Should password reset functionality be included?
4. Are there specific security requirements (2FA, password complexity)?
5. Which database should store user credentials?

### How to Respond
Please answer the questions above. You can use this format:

```
ANSWER 1: Use JWT tokens for stateless authentication
ANSWER 2: Support admin and user roles initially
ANSWER 3: Yes, include password reset via email
ANSWER 4: Require 8+ character passwords, no 2FA for now
ANSWER 5: Use the existing PostgreSQL database
```
```

### 2. Implementation Planning & Verification

For complex tasks, the agent creates an implementation plan and requests verification.

#### Agent Behavior:
- **Creates detailed implementation plan** with approach and architecture
- **Identifies files to be modified/created**
- **Lists implementation steps** and testing strategy
- **Requests human verification** for complex or risky changes
- **Waits for approval** before starting implementation

#### Example Implementation Plan:

```markdown
## 🤖 AI Agent Implementation Plan Verification

### My Implementation Plan

#### Approach
- Implement JWT-based authentication system
- Create middleware for route protection
- Add user registration and login endpoints
- Use bcrypt for password hashing

#### Files to be Modified/Created
- `src/auth/authService.js` (new)
- `src/auth/authMiddleware.js` (new)
- `src/routes/auth.js` (new)
- `src/models/User.js` (modify)
- `src/app.js` (modify - add auth routes)

#### Implementation Steps
1. Create User model with authentication fields
2. Implement JWT token generation and validation
3. Create registration endpoint with validation
4. Create login endpoint with credential verification
5. Add authentication middleware
6. Protect existing routes that require authentication
7. Add comprehensive tests

#### Testing Strategy
- Unit tests for auth service functions
- Integration tests for auth endpoints
- Middleware tests for route protection
- End-to-end authentication flow tests

### Questions for You
1. Does this approach align with your expectations?
2. Should I proceed with this implementation plan?
3. Any specific requirements I should consider?

### How to Respond
```
APPROVAL: Yes
FEEDBACK: Looks good, but also add rate limiting for login attempts
PROCEED: Start with the implementation
```
```

### 3. Branch Creation & Implementation

Once approved, the agent creates a feature branch and implements the changes.

#### Agent Behavior:
- **Creates feature branch** with descriptive name
- **Switches to feature branch** for development
- **Implements changes** following the approved plan
- **Follows existing code patterns** and conventions
- **Adds appropriate tests** for new functionality
- **Commits changes** with descriptive messages

#### Branch Naming Convention:
- `feature/user-authentication-jwt`
- `bugfix/memory-leak-data-processor`
- `refactor/api-error-handling`

#### Commit Message Format:
```
feat(auth): implement JWT-based user authentication

- Add User model with authentication fields
- Create JWT token generation and validation service
- Implement registration and login endpoints
- Add authentication middleware for route protection
- Include comprehensive test suite

Resolves: #123
```

### 4. Testing & Quality Assurance

The agent runs tests and ensures code quality before creating a pull request.

#### Agent Behavior:
- **Runs existing test suite** to ensure no regressions
- **Fixes failing tests** if implementation changes break them
- **Adds new tests** for implemented functionality
- **Checks code quality** and follows project conventions
- **Commits test fixes** if needed

### 5. Pull Request Creation

The agent creates a comprehensive pull request for human review.

#### Agent Behavior:
- **Creates pull request** from feature branch to main
- **Links to original issue** that requested the work
- **Provides detailed description** of changes made
- **Includes testing information** and verification steps
- **Adds appropriate labels** for categorization

#### Example Pull Request:

```markdown
## Description
Implements JWT-based user authentication system as requested in #123.

## Changes Made
- ✅ Created User model with authentication fields
- ✅ Implemented JWT token generation and validation
- ✅ Added registration endpoint with input validation
- ✅ Added login endpoint with credential verification
- ✅ Created authentication middleware for route protection
- ✅ Protected existing user data endpoints
- ✅ Added comprehensive test suite (95% coverage)

## Files Modified
- `src/auth/authService.js` (new)
- `src/auth/authMiddleware.js` (new)
- `src/routes/auth.js` (new)
- `src/models/User.js` (modified)
- `src/app.js` (modified)
- `tests/auth/` (new test files)

## Testing
- ✅ All existing tests pass
- ✅ New authentication tests added
- ✅ Integration tests for auth flow
- ✅ Manual testing completed

## Breaking Changes
None - all existing functionality preserved.

## Additional Notes
- Added rate limiting for login attempts (5 attempts per 15 minutes)
- Passwords are hashed using bcrypt with salt rounds of 12
- JWT tokens expire after 24 hours
- Refresh token mechanism not included (can be added later)

## Checklist
- [x] Code follows project conventions
- [x] Tests are passing
- [x] Documentation updated
- [x] No breaking changes
- [x] Security considerations addressed

## Related Issue
Resolves #123

---
*This pull request was created by an AI agent. Please review and provide feedback.*
```

### 6. Human Review Process

The agent waits for human review and responds to feedback.

#### Human Review Actions:
- **Review code changes** in the pull request
- **Test functionality** if needed
- **Provide feedback** via PR comments
- **Request changes** or approve the PR
- **Suggest improvements** or alternatives

#### Agent Response to Review:
- **Monitors PR for comments** and review feedback
- **Analyzes review comments** and requested changes
- **Implements requested changes** on the same branch
- **Responds to reviewers** explaining changes made
- **Commits additional changes** to address feedback

#### Example Review Response:

```markdown
Thanks for the feedback! I've addressed your comments:

**Regarding rate limiting implementation:**
- Moved rate limiting to middleware for reusability
- Added configurable limits via environment variables
- Updated tests to cover rate limiting scenarios

**Regarding password validation:**
- Enhanced password requirements (min 8 chars, special chars)
- Added password strength indicator
- Improved error messages for validation failures

**Regarding error handling:**
- Standardized error response format
- Added proper HTTP status codes
- Improved logging for authentication failures

All changes have been committed and pushed. The tests are passing and coverage remains at 95%.
```

### 7. Merge & Cleanup

Once approved, the human merges the pull request and the agent cleans up.

#### Human Actions:
- **Approve pull request** when satisfied with changes
- **Merge pull request** to main branch
- **Close related issue** if automatically linked

#### Agent Cleanup:
- **Monitors for merge completion**
- **Updates task status** to completed
- **Cleans up feature branch** (if configured)
- **Updates issue with completion status**

## 🎯 Workflow Triggers

### Automatic Workflow Triggers

1. **Issue Creation** with `ai-agent-task` label
2. **Pull Request Comments** with review feedback
3. **Issue Comments** with clarification responses
4. **Webhook Events** from repository changes

### Manual Workflow Controls

1. **Agent Commands** via issue comments:
   - `@agent pause` - Pause current work
   - `@agent resume` - Resume paused work
   - `@agent status` - Get current status
   - `@agent cancel` - Cancel the task

2. **Human Responses** with structured format:
   - `DECISION:` - Make implementation decisions
   - `CODE:` - Provide specific code guidance
   - `GUIDANCE:` - Give general direction
   - `APPROVAL:` - Approve implementation plans

## 🔧 Configuration Options

### Task Configuration

```json
{
  "repository": {
    "url": "https://github.com/org/repo.git",
    "branch": "main"
  },
  "description": "Implement user authentication",
  "agent": "claude",
  "workflow": {
    "requireClarification": true,
    "requireVerification": true,
    "autoCreateBranch": true,
    "autoCreatePR": true,
    "autoCleanupBranch": false
  },
  "quality": {
    "runTests": true,
    "requireTestCoverage": 80,
    "runLinting": true,
    "requireDocumentation": true
  }
}
```

### Agent Behavior Settings

```env
# Workflow behavior
REQUIRE_CLARIFICATION_FOR_COMPLEX_TASKS=true
REQUIRE_VERIFICATION_FOR_RISKY_CHANGES=true
AUTO_CREATE_FEATURE_BRANCHES=true
AUTO_CREATE_PULL_REQUESTS=true

# Quality gates
MINIMUM_TEST_COVERAGE=80
RUN_TESTS_BEFORE_PR=true
RUN_LINTING_BEFORE_PR=true

# Review settings
WAIT_FOR_HUMAN_APPROVAL=true
AUTO_MERGE_APPROVED_PRS=false
CLEANUP_MERGED_BRANCHES=false
```

## 📊 Workflow Monitoring

### Task Status Tracking

- **queued** - Task created, waiting to start
- **analyzing** - Analyzing requirements
- **awaiting_clarification** - Waiting for human clarification
- **planning** - Creating implementation plan
- **awaiting_verification** - Waiting for plan approval
- **implementing** - Writing code
- **testing** - Running tests
- **creating_pr** - Creating pull request
- **awaiting_review** - Waiting for human review
- **addressing_feedback** - Responding to review comments
- **completed** - Task finished and merged
- **failed** - Task failed with errors
- **cancelled** - Task cancelled by human

### Progress Indicators

```bash
# Check task progress
curl http://localhost:9000/tasks/{task-id}

# Response includes workflow step
{
  "id": "task-123",
  "status": "awaiting_review",
  "workflow": {
    "currentStep": "pull_request_created",
    "completedSteps": [
      "requirements_analysis",
      "implementation_planning", 
      "branch_creation",
      "implementation",
      "testing",
      "pull_request_creation"
    ],
    "nextStep": "review_response"
  },
  "pullRequest": {
    "number": 45,
    "url": "https://gitea.example.com/org/repo/pulls/45"
  }
}
```

## 🚀 Best Practices

### For Humans

1. **Provide Clear Requirements**
   - Be specific about expected outcomes
   - Include technical constraints
   - Mention existing patterns to follow

2. **Respond Promptly to Clarifications**
   - Answer agent questions clearly
   - Provide examples when helpful
   - Be decisive in your guidance

3. **Review Pull Requests Thoroughly**
   - Test the functionality
   - Check code quality and patterns
   - Provide constructive feedback

4. **Use Structured Responses**
   - Use `DECISION:`, `CODE:`, `GUIDANCE:` prefixes
   - Be specific in your instructions
   - Explain reasoning when helpful

### For Agents

1. **Ask Questions Early**
   - Don't assume unclear requirements
   - Ask specific, actionable questions
   - Wait for clarification before proceeding

2. **Follow Development Best Practices**
   - Create descriptive branch names
   - Write clear commit messages
   - Add comprehensive tests
   - Follow existing code patterns

3. **Communicate Progress**
   - Update issue with progress
   - Explain implementation decisions
   - Respond to review feedback promptly

4. **Maintain Quality**
   - Run tests before creating PR
   - Follow code style guidelines
   - Add appropriate documentation
   - Handle errors gracefully

This workflow ensures that AI agents work collaboratively with humans, following established development practices while maintaining quality and enabling proper oversight and guidance throughout the development process.