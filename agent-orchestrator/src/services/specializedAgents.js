const logger = require('../utils/logger');
const agentService = require('./agentService');
const giteaClient = require('./giteaClient');

class SpecializedAgents {
  constructor() {
    this.agentSpecializations = {
      'software-architect': {
        name: 'Software Architect',
        expertise: ['architecture', 'design patterns', 'system design', 'scalability', 'performance'],
        filePatterns: ['**/architecture/**', '**/design/**', '**/config/**', 'docker*', '*.yml', '*.yaml'],
        keywords: ['architecture', 'design', 'pattern', 'scalability', 'performance', 'system', 'infrastructure'],
        reviewFocus: ['architectural decisions', 'design patterns', 'system scalability', 'performance implications', 'maintainability'],
        model: 'claude' // Preferred model for this specialization
      },
      
      'mobile-developer': {
        name: 'Mobile Developer',
        expertise: ['mobile development', 'iOS', 'Android', 'React Native', 'Flutter', 'mobile UX'],
        filePatterns: ['**/*.swift', '**/*.kt', '**/*.java', '**/android/**', '**/ios/**', '**/mobile/**'],
        keywords: ['mobile', 'ios', 'android', 'react native', 'flutter', 'app', 'device', 'platform'],
        reviewFocus: ['mobile best practices', 'platform-specific considerations', 'performance on mobile', 'user experience', 'battery usage'],
        model: 'openai'
      },
      
      'web-developer': {
        name: 'Web Developer',
        expertise: ['frontend', 'React', 'Vue', 'Angular', 'HTML', 'CSS', 'JavaScript', 'TypeScript', 'web UX'],
        filePatterns: ['**/*.js', '**/*.ts', '**/*.jsx', '**/*.tsx', '**/*.html', '**/*.css', '**/*.scss', '**/components/**', '**/pages/**'],
        keywords: ['frontend', 'react', 'vue', 'angular', 'component', 'ui', 'ux', 'web', 'browser', 'responsive'],
        reviewFocus: ['code quality', 'component design', 'accessibility', 'browser compatibility', 'user experience', 'performance'],
        model: 'claude'
      },
      
      'backend-developer': {
        name: 'Backend Developer',
        expertise: ['backend', 'APIs', 'microservices', 'server-side', 'Node.js', 'Python', 'Java', 'Go'],
        filePatterns: ['**/api/**', '**/server/**', '**/backend/**', '**/services/**', '**/controllers/**', '**/routes/**'],
        keywords: ['api', 'backend', 'server', 'microservice', 'endpoint', 'service', 'controller', 'middleware'],
        reviewFocus: ['API design', 'error handling', 'security', 'performance', 'scalability', 'business logic'],
        model: 'claude'
      },
      
      'qa-engineer': {
        name: 'QA Engineer',
        expertise: ['testing', 'quality assurance', 'test automation', 'bug detection', 'test coverage'],
        filePatterns: ['**/test/**', '**/tests/**', '**/*.test.*', '**/*.spec.*', '**/cypress/**', '**/jest/**'],
        keywords: ['test', 'testing', 'qa', 'quality', 'coverage', 'automation', 'spec', 'assertion'],
        reviewFocus: ['test coverage', 'test quality', 'edge cases', 'error scenarios', 'test maintainability', 'automation'],
        model: 'openai'
      },
      
      'database-specialist': {
        name: 'Database Specialist',
        expertise: ['database', 'SQL', 'NoSQL', 'data modeling', 'performance optimization', 'migrations'],
        filePatterns: ['**/migrations/**', '**/models/**', '**/schemas/**', '**/*.sql', '**/database/**', '**/db/**'],
        keywords: ['database', 'sql', 'nosql', 'migration', 'schema', 'model', 'query', 'index', 'performance'],
        reviewFocus: ['data modeling', 'query performance', 'indexing', 'migration safety', 'data integrity', 'security'],
        model: 'claude'
      },
      
      'security-specialist': {
        name: 'Security Specialist',
        expertise: ['security', 'authentication', 'authorization', 'encryption', 'vulnerability assessment'],
        filePatterns: ['**/auth/**', '**/security/**', '**/crypto/**', '**/ssl/**', '**/oauth/**'],
        keywords: ['security', 'auth', 'authentication', 'authorization', 'encryption', 'vulnerability', 'ssl', 'oauth', 'jwt'],
        reviewFocus: ['security vulnerabilities', 'authentication flows', 'data protection', 'access control', 'encryption', 'compliance'],
        model: 'claude'
      },
      
      'devops-engineer': {
        name: 'DevOps Engineer',
        expertise: ['CI/CD', 'deployment', 'infrastructure', 'monitoring', 'containerization'],
        filePatterns: ['**/ci/**', '**/cd/**', '**/deploy/**', '**/k8s/**', '**/docker/**', '*.dockerfile', '**/terraform/**'],
        keywords: ['ci', 'cd', 'deployment', 'infrastructure', 'docker', 'kubernetes', 'terraform', 'monitoring'],
        reviewFocus: ['deployment safety', 'infrastructure as code', 'monitoring', 'scalability', 'reliability', 'automation'],
        model: 'openai'
      }
    };
    
    this.activeReviewers = new Map();
  }

  async reviewPullRequest(pullRequest, repository) {
    try {
      logger.info(`Starting specialized review for PR #${pullRequest.number}`);
      
      // Get PR details including changed files
      const prDetails = await this.getPullRequestDetails(pullRequest, repository);
      
      // Determine which specialists should review this PR
      const relevantSpecialists = await this.identifyRelevantSpecialists(prDetails);
      
      if (relevantSpecialists.length === 0) {
        logger.info(`No specialized reviewers needed for PR #${pullRequest.number}`);
        return;
      }
      
      // Create review tasks for each relevant specialist
      const reviewPromises = relevantSpecialists.map(specialist => 
        this.createSpecializedReview(specialist, prDetails, repository)
      );
      
      const reviews = await Promise.allSettled(reviewPromises);
      
      // Process review results
      await this.processReviewResults(reviews, pullRequest, repository);
      
      logger.info(`Completed specialized reviews for PR #${pullRequest.number}`);
      
    } catch (error) {
      logger.error(`Failed to review PR #${pullRequest.number}:`, error);
    }
  }

  async getPullRequestDetails(pullRequest, repository) {
    // Get changed files and their content
    const changedFiles = await giteaClient.getPullRequestFiles(
      repository.owner,
      repository.name,
      pullRequest.number
    );
    
    // Get PR diff
    const diff = await giteaClient.getPullRequestDiff(
      repository.owner,
      repository.name,
      pullRequest.number
    );
    
    // Get PR description and metadata
    const prData = await giteaClient.getPullRequest(
      repository.owner,
      repository.name,
      pullRequest.number
    );
    
    return {
      pullRequest: prData,
      changedFiles: changedFiles,
      diff: diff,
      repository: repository,
      title: pullRequest.title,
      description: pullRequest.body || '',
      labels: pullRequest.labels || []
    };
  }

  async identifyRelevantSpecialists(prDetails) {
    const relevantSpecialists = [];
    
    for (const [specialistId, specialist] of Object.entries(this.agentSpecializations)) {
      const relevanceScore = this.calculateRelevanceScore(specialist, prDetails);
      
      if (relevanceScore > 0.3) { // Threshold for relevance
        relevantSpecialists.push({
          id: specialistId,
          ...specialist,
          relevanceScore: relevanceScore
        });
      }
    }
    
    // Sort by relevance score (highest first)
    return relevantSpecialists.sort((a, b) => b.relevanceScore - a.relevanceScore);
  }

  calculateRelevanceScore(specialist, prDetails) {
    let score = 0;
    
    // Check file patterns
    const fileScore = this.calculateFilePatternScore(specialist.filePatterns, prDetails.changedFiles);
    score += fileScore * 0.4;
    
    // Check keywords in title and description
    const keywordScore = this.calculateKeywordScore(specialist.keywords, prDetails);
    score += keywordScore * 0.3;
    
    // Check labels
    const labelScore = this.calculateLabelScore(specialist.expertise, prDetails.labels);
    score += labelScore * 0.2;
    
    // Check diff content
    const diffScore = this.calculateDiffScore(specialist.keywords, prDetails.diff);
    score += diffScore * 0.1;
    
    return Math.min(score, 1.0); // Cap at 1.0
  }

  calculateFilePatternScore(patterns, changedFiles) {
    if (!changedFiles || changedFiles.length === 0) return 0;
    
    const matchingFiles = changedFiles.filter(file => 
      patterns.some(pattern => this.matchesPattern(file.filename, pattern))
    );
    
    return matchingFiles.length / changedFiles.length;
  }

  matchesPattern(filename, pattern) {
    // Simple pattern matching (could be enhanced with proper glob matching)
    const regex = pattern
      .replace(/\*\*/g, '.*')
      .replace(/\*/g, '[^/]*')
      .replace(/\./g, '\\.');
    
    return new RegExp(regex, 'i').test(filename);
  }

  calculateKeywordScore(keywords, prDetails) {
    const text = `${prDetails.title} ${prDetails.description}`.toLowerCase();
    const matchingKeywords = keywords.filter(keyword => text.includes(keyword.toLowerCase()));
    
    return matchingKeywords.length / keywords.length;
  }

  calculateLabelScore(expertise, labels) {
    if (!labels || labels.length === 0) return 0;
    
    const labelTexts = labels.map(label => label.name || label).join(' ').toLowerCase();
    const matchingExpertise = expertise.filter(exp => labelTexts.includes(exp.toLowerCase()));
    
    return matchingExpertise.length / expertise.length;
  }

  calculateDiffScore(keywords, diff) {
    if (!diff) return 0;
    
    const diffText = diff.toLowerCase();
    const matchingKeywords = keywords.filter(keyword => diffText.includes(keyword.toLowerCase()));
    
    return Math.min(matchingKeywords.length / keywords.length, 0.5); // Cap contribution
  }

  async createSpecializedReview(specialist, prDetails, repository) {
    try {
      logger.info(`Creating ${specialist.name} review for PR #${prDetails.pullRequest.number}`);
      
      // Create specialized agent for this review
      const reviewAgent = await this.createReviewAgent(specialist, prDetails);
      
      // Generate specialized review
      const review = await this.generateSpecializedReview(reviewAgent, specialist, prDetails);
      
      // Post review as comment
      await this.postReviewComment(review, specialist, prDetails, repository);
      
      return {
        specialist: specialist,
        review: review,
        status: 'completed'
      };
      
    } catch (error) {
      logger.error(`Failed to create ${specialist.name} review:`, error);
      return {
        specialist: specialist,
        error: error.message,
        status: 'failed'
      };
    }
  }

  async createReviewAgent(specialist, prDetails) {
    const agentId = `${specialist.id}_reviewer_${Date.now()}`;
    
    const agent = {
      id: agentId,
      type: specialist.model,
      specialization: specialist.id,
      name: specialist.name,
      expertise: specialist.expertise,
      reviewFocus: specialist.reviewFocus,
      context: {
        conversationHistory: [],
        pullRequest: prDetails.pullRequest,
        repository: prDetails.repository
      },
      createdAt: new Date()
    };
    
    this.activeReviewers.set(agentId, agent);
    return agent;
  }

  async generateSpecializedReview(agent, specialist, prDetails) {
    const reviewPrompt = this.buildReviewPrompt(specialist, prDetails);
    
    let review;
    if (agent.type === 'claude') {
      review = await this.generateClaudeReview(agent, reviewPrompt);
    } else {
      review = await this.generateOpenAIReview(agent, reviewPrompt);
    }
    
    return this.parseReviewResponse(review, specialist);
  }

  buildReviewPrompt(specialist, prDetails) {
    return `You are a ${specialist.name} conducting a specialized code review.

## Your Expertise
${specialist.expertise.join(', ')}

## Review Focus Areas
${specialist.reviewFocus.join(', ')}

## Pull Request Details
**Title**: ${prDetails.title}
**Description**: ${prDetails.description}

## Changed Files
${prDetails.changedFiles.map(f => `- ${f.filename} (+${f.additions} -${f.deletions})`).join('\n')}

## Code Changes
\`\`\`diff
${prDetails.diff.substring(0, 8000)} ${prDetails.diff.length > 8000 ? '... (truncated)' : ''}
\`\`\`

## Instructions
Please provide a specialized review focusing on your area of expertise. Structure your response as:

### Overall Assessment
[APPROVE/REQUEST_CHANGES/COMMENT] - Your overall recommendation

### Key Findings
- List specific issues or observations relevant to your specialization
- Focus on ${specialist.reviewFocus.join(', ')}

### Recommendations
- Specific actionable recommendations
- Best practices from your domain
- Potential improvements

### Positive Aspects
- What was done well in your area of expertise
- Good practices observed

### Risk Assessment
- Potential risks or concerns from your perspective
- Impact on ${specialist.expertise.join(', ')}

Be specific, constructive, and focus only on aspects within your expertise. Provide code examples or specific line references when possible.`;
  }

  async generateClaudeReview(agent, prompt) {
    const anthropic = agentService.anthropic;
    
    const response = await anthropic.messages.create({
      model: 'claude-3-sonnet-20240229',
      max_tokens: 4000,
      system: `You are an expert ${agent.name} with deep knowledge in ${agent.expertise.join(', ')}. Provide thorough, constructive code reviews focusing on your specialization.`,
      messages: [
        { role: 'user', content: prompt }
      ]
    });
    
    return response.content[0].text;
  }

  async generateOpenAIReview(agent, prompt) {
    const openai = agentService.openai;
    
    const response = await openai.chat.completions.create({
      model: 'gpt-4',
      max_tokens: 4000,
      messages: [
        {
          role: 'system',
          content: `You are an expert ${agent.name} with deep knowledge in ${agent.expertise.join(', ')}. Provide thorough, constructive code reviews focusing on your specialization.`
        },
        { role: 'user', content: prompt }
      ]
    });
    
    return response.choices[0].message.content;
  }

  parseReviewResponse(reviewText, specialist) {
    const sections = {
      assessment: this.extractSection(reviewText, 'Overall Assessment'),
      findings: this.extractSection(reviewText, 'Key Findings'),
      recommendations: this.extractSection(reviewText, 'Recommendations'),
      positives: this.extractSection(reviewText, 'Positive Aspects'),
      risks: this.extractSection(reviewText, 'Risk Assessment')
    };
    
    // Extract overall recommendation
    const assessmentMatch = sections.assessment.match(/(APPROVE|REQUEST_CHANGES|COMMENT)/);
    const recommendation = assessmentMatch ? assessmentMatch[1] : 'COMMENT';
    
    return {
      specialist: specialist.name,
      recommendation: recommendation,
      sections: sections,
      fullReview: reviewText,
      timestamp: new Date().toISOString()
    };
  }

  extractSection(text, sectionName) {
    const regex = new RegExp(`### ${sectionName}\\s*\\n([\\s\\S]*?)(?=\\n### |$)`, 'i');
    const match = text.match(regex);
    return match ? match[1].trim() : '';
  }

  async postReviewComment(review, specialist, prDetails, repository) {
    const commentBody = this.formatReviewComment(review, specialist);
    
    await giteaClient.createPullRequestComment(
      repository.owner,
      repository.name,
      prDetails.pullRequest.number,
      commentBody
    );
    
    // Add review label
    const labelName = `reviewed-by-${specialist.id}`;
    await this.addReviewLabel(repository, prDetails.pullRequest.number, labelName, specialist);
  }

  formatReviewComment(review, specialist) {
    const emoji = this.getRecommendationEmoji(review.recommendation);
    
    return `## ${emoji} ${specialist.name} Review

**Recommendation**: ${review.recommendation}

### Key Findings
${review.sections.findings}

### Recommendations
${review.sections.recommendations}

### Positive Aspects
${review.sections.positives}

### Risk Assessment
${review.sections.risks}

---
*This review was automatically generated by the ${specialist.name} AI specialist focusing on ${specialist.expertise.join(', ')}.*

**Review Focus**: ${specialist.reviewFocus.join(', ')}`;
  }

  getRecommendationEmoji(recommendation) {
    switch (recommendation) {
      case 'APPROVE': return '✅';
      case 'REQUEST_CHANGES': return '❌';
      case 'COMMENT': return '💬';
      default: return '🔍';
    }
  }

  async addReviewLabel(repository, prNumber, labelName, specialist) {
    try {
      // Create label if it doesn't exist
      await giteaClient.createLabel(repository.owner, repository.name, {
        name: labelName,
        color: this.getSpecialistColor(specialist.id),
        description: `Reviewed by ${specialist.name} AI specialist`
      });
      
      // Add label to PR
      await giteaClient.addLabelToPullRequest(
        repository.owner,
        repository.name,
        prNumber,
        labelName
      );
    } catch (error) {
      logger.warn(`Failed to add review label ${labelName}:`, error);
    }
  }

  getSpecialistColor(specialistId) {
    const colors = {
      'software-architect': '#6f42c1',
      'mobile-developer': '#28a745',
      'web-developer': '#007bff',
      'backend-developer': '#fd7e14',
      'qa-engineer': '#dc3545',
      'database-specialist': '#20c997',
      'security-specialist': '#e83e8c',
      'devops-engineer': '#6c757d'
    };
    return colors[specialistId] || '#586069';
  }

  async processReviewResults(reviews, pullRequest, repository) {
    const completedReviews = reviews
      .filter(result => result.status === 'fulfilled' && result.value.status === 'completed')
      .map(result => result.value);
    
    const failedReviews = reviews
      .filter(result => result.status === 'rejected' || result.value.status === 'failed');
    
    if (failedReviews.length > 0) {
      logger.warn(`${failedReviews.length} specialized reviews failed for PR #${pullRequest.number}`);
    }
    
    // Create summary comment if multiple reviews
    if (completedReviews.length > 1) {
      await this.createReviewSummary(completedReviews, pullRequest, repository);
    }
    
    // Update PR status based on reviews
    await this.updatePullRequestStatus(completedReviews, pullRequest, repository);
  }

  async createReviewSummary(reviews, pullRequest, repository) {
    const approvals = reviews.filter(r => r.review.recommendation === 'APPROVE').length;
    const changes = reviews.filter(r => r.review.recommendation === 'REQUEST_CHANGES').length;
    const comments = reviews.filter(r => r.review.recommendation === 'COMMENT').length;
    
    const summaryBody = `## 🤖 Specialized Review Summary

**Reviewers**: ${reviews.map(r => r.specialist.name).join(', ')}

**Results**:
- ✅ **Approvals**: ${approvals}
- ❌ **Changes Requested**: ${changes}
- 💬 **Comments**: ${comments}

### Specialist Recommendations
${reviews.map(r => `- **${r.specialist.name}**: ${r.review.recommendation}`).join('\n')}

### Next Steps
${changes > 0 
  ? '⚠️ Please address the issues raised by specialists before merging.'
  : approvals > 0 
    ? '✅ Specialists have approved the changes. Ready for human review.'
    : '💬 Specialists have provided feedback for consideration.'
}

---
*This summary was generated from automated specialist reviews. Human review is still recommended.*`;

    await giteaClient.createPullRequestComment(
      repository.owner,
      repository.name,
      pullRequest.number,
      summaryBody
    );
  }

  async updatePullRequestStatus(reviews, pullRequest, repository) {
    const hasBlockingIssues = reviews.some(r => r.review.recommendation === 'REQUEST_CHANGES');
    
    if (hasBlockingIssues) {
      // Add label indicating changes needed
      await giteaClient.addLabelToPullRequest(
        repository.owner,
        repository.name,
        pullRequest.number,
        'specialist-changes-requested'
      );
    } else {
      // Add label indicating specialist approval
      await giteaClient.addLabelToPullRequest(
        repository.owner,
        repository.name,
        pullRequest.number,
        'specialist-approved'
      );
    }
  }

  // Public methods for managing specialists
  getAvailableSpecialists() {
    return Object.entries(this.agentSpecializations).map(([id, specialist]) => ({
      id,
      name: specialist.name,
      expertise: specialist.expertise,
      reviewFocus: specialist.reviewFocus
    }));
  }

  async enableSpecialistForRepository(repositoryId, specialistIds) {
    // Enable specific specialists for a repository
    // This could be stored in database for persistence
    logger.info(`Enabled specialists ${specialistIds.join(', ')} for repository ${repositoryId}`);
  }

  async disableSpecialistForRepository(repositoryId, specialistIds) {
    // Disable specific specialists for a repository
    logger.info(`Disabled specialists ${specialistIds.join(', ')} for repository ${repositoryId}`);
  }
}

module.exports = new SpecializedAgents();