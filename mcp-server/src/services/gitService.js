const simpleGit = require('simple-git');
const path = require('path');
const fs = require('fs').promises;
const logger = require('../utils/logger');

class GitService {
  constructor() {
    this.repositories = new Map(); // Cache for git instances
  }

  async getGitInstance(repositoryPath) {
    if (!this.repositories.has(repositoryPath)) {
      const git = simpleGit(repositoryPath);
      this.repositories.set(repositoryPath, git);
    }
    return this.repositories.get(repositoryPath);
  }

  async cloneRepository(url, targetPath, branch = 'main') {
    try {
      logger.info(`Cloning repository ${url} to ${targetPath}`);
      
      // Ensure target directory exists
      await fs.mkdir(path.dirname(targetPath), { recursive: true });
      
      const git = simpleGit();
      await git.clone(url, targetPath, ['--branch', branch]);
      
      logger.info(`Successfully cloned repository to ${targetPath}`);
      return targetPath;
    } catch (error) {
      logger.error(`Failed to clone repository ${url}:`, error);
      throw error;
    }
  }

  async createBranch(repositoryPath, branchName, baseBranch = 'main') {
    try {
      const git = await this.getGitInstance(repositoryPath);
      
      // Ensure we're on the base branch
      await git.checkout(baseBranch);
      
      // Pull latest changes
      await git.pull('origin', baseBranch);
      
      // Create and checkout new branch
      await git.checkoutLocalBranch(branchName);
      
      logger.info(`Created branch ${branchName} from ${baseBranch}`);
      return branchName;
    } catch (error) {
      logger.error(`Failed to create branch ${branchName}:`, error);
      throw error;
    }
  }

  async checkoutBranch(repositoryPath, branchName) {
    try {
      const git = await this.getGitInstance(repositoryPath);
      await git.checkout(branchName);
      
      logger.info(`Checked out branch ${branchName}`);
      return true;
    } catch (error) {
      logger.error(`Failed to checkout branch ${branchName}:`, error);
      throw error;
    }
  }

  async addFiles(repositoryPath, files = []) {
    try {
      const git = await this.getGitInstance(repositoryPath);
      
      if (files.length === 0) {
        await git.add('.');
      } else {
        await git.add(files);
      }
      
      logger.info(`Added files to staging: ${files.length === 0 ? 'all files' : files.join(', ')}`);
      return true;
    } catch (error) {
      logger.error(`Failed to add files:`, error);
      throw error;
    }
  }

  async commit(repositoryPath, message, author = null) {
    try {
      const git = await this.getGitInstance(repositoryPath);
      
      const commitOptions = {};
      if (author) {
        commitOptions['--author'] = `${author.name} <${author.email}>`;
      }
      
      const result = await git.commit(message, undefined, commitOptions);
      
      logger.info(`Created commit: ${result.commit}`);
      return result;
    } catch (error) {
      logger.error(`Failed to commit changes:`, error);
      throw error;
    }
  }

  async push(repositoryPath, remote = 'origin', branch = null) {
    try {
      const git = await this.getGitInstance(repositoryPath);
      
      if (!branch) {
        // Get current branch
        const status = await git.status();
        branch = status.current;
      }
      
      await git.push(remote, branch);
      
      logger.info(`Pushed branch ${branch} to ${remote}`);
      return true;
    } catch (error) {
      logger.error(`Failed to push branch ${branch}:`, error);
      throw error;
    }
  }

  async pull(repositoryPath, remote = 'origin', branch = 'main') {
    try {
      const git = await this.getGitInstance(repositoryPath);
      await git.pull(remote, branch);
      
      logger.info(`Pulled latest changes from ${remote}/${branch}`);
      return true;
    } catch (error) {
      logger.error(`Failed to pull from ${remote}/${branch}:`, error);
      throw error;
    }
  }

  async getStatus(repositoryPath) {
    try {
      const git = await this.getGitInstance(repositoryPath);
      const status = await git.status();
      
      return {
        current: status.current,
        tracking: status.tracking,
        ahead: status.ahead,
        behind: status.behind,
        staged: status.staged,
        modified: status.modified,
        created: status.created,
        deleted: status.deleted,
        renamed: status.renamed,
        conflicted: status.conflicted
      };
    } catch (error) {
      logger.error(`Failed to get git status:`, error);
      throw error;
    }
  }

  async getBranches(repositoryPath) {
    try {
      const git = await this.getGitInstance(repositoryPath);
      const branches = await git.branch(['-a']);
      
      return {
        current: branches.current,
        all: branches.all,
        local: branches.all.filter(b => !b.startsWith('remotes/')),
        remote: branches.all.filter(b => b.startsWith('remotes/'))
      };
    } catch (error) {
      logger.error(`Failed to get branches:`, error);
      throw error;
    }
  }

  async getCommitHistory(repositoryPath, options = {}) {
    try {
      const git = await this.getGitInstance(repositoryPath);
      const log = await git.log({
        maxCount: options.limit || 10,
        from: options.from,
        to: options.to
      });
      
      return log.all.map(commit => ({
        hash: commit.hash,
        date: commit.date,
        message: commit.message,
        author: commit.author_name,
        email: commit.author_email
      }));
    } catch (error) {
      logger.error(`Failed to get commit history:`, error);
      throw error;
    }
  }

  async getDiff(repositoryPath, options = {}) {
    try {
      const git = await this.getGitInstance(repositoryPath);
      
      let diff;
      if (options.staged) {
        diff = await git.diff(['--staged']);
      } else if (options.commit) {
        diff = await git.diff([options.commit]);
      } else {
        diff = await git.diff();
      }
      
      return diff;
    } catch (error) {
      logger.error(`Failed to get diff:`, error);
      throw error;
    }
  }

  async createTag(repositoryPath, tagName, message = null) {
    try {
      const git = await this.getGitInstance(repositoryPath);
      
      if (message) {
        await git.addAnnotatedTag(tagName, message);
      } else {
        await git.addTag(tagName);
      }
      
      logger.info(`Created tag: ${tagName}`);
      return true;
    } catch (error) {
      logger.error(`Failed to create tag ${tagName}:`, error);
      throw error;
    }
  }

  async mergeBranch(repositoryPath, branchName, options = {}) {
    try {
      const git = await this.getGitInstance(repositoryPath);
      
      const mergeOptions = [];
      if (options.noFastForward) {
        mergeOptions.push('--no-ff');
      }
      if (options.squash) {
        mergeOptions.push('--squash');
      }
      
      await git.merge([branchName, ...mergeOptions]);
      
      logger.info(`Merged branch ${branchName}`);
      return true;
    } catch (error) {
      logger.error(`Failed to merge branch ${branchName}:`, error);
      throw error;
    }
  }

  async deleteBranch(repositoryPath, branchName, force = false) {
    try {
      const git = await this.getGitInstance(repositoryPath);
      
      if (force) {
        await git.deleteLocalBranch(branchName, true);
      } else {
        await git.deleteLocalBranch(branchName);
      }
      
      logger.info(`Deleted branch ${branchName}`);
      return true;
    } catch (error) {
      logger.error(`Failed to delete branch ${branchName}:`, error);
      throw error;
    }
  }

  async stash(repositoryPath, message = null) {
    try {
      const git = await this.getGitInstance(repositoryPath);
      
      if (message) {
        await git.stash(['push', '-m', message]);
      } else {
        await git.stash();
      }
      
      logger.info(`Stashed changes${message ? `: ${message}` : ''}`);
      return true;
    } catch (error) {
      logger.error(`Failed to stash changes:`, error);
      throw error;
    }
  }

  async stashPop(repositoryPath) {
    try {
      const git = await this.getGitInstance(repositoryPath);
      await git.stash(['pop']);
      
      logger.info(`Popped stashed changes`);
      return true;
    } catch (error) {
      logger.error(`Failed to pop stashed changes:`, error);
      throw error;
    }
  }

  async reset(repositoryPath, mode = 'mixed', commit = 'HEAD') {
    try {
      const git = await this.getGitInstance(repositoryPath);
      await git.reset([`--${mode}`, commit]);
      
      logger.info(`Reset to ${commit} with mode ${mode}`);
      return true;
    } catch (error) {
      logger.error(`Failed to reset:`, error);
      throw error;
    }
  }

  async getRemotes(repositoryPath) {
    try {
      const git = await this.getGitInstance(repositoryPath);
      const remotes = await git.getRemotes(true);
      
      return remotes.map(remote => ({
        name: remote.name,
        refs: remote.refs
      }));
    } catch (error) {
      logger.error(`Failed to get remotes:`, error);
      throw error;
    }
  }

  async addRemote(repositoryPath, name, url) {
    try {
      const git = await this.getGitInstance(repositoryPath);
      await git.addRemote(name, url);
      
      logger.info(`Added remote ${name}: ${url}`);
      return true;
    } catch (error) {
      logger.error(`Failed to add remote ${name}:`, error);
      throw error;
    }
  }

  async removeRemote(repositoryPath, name) {
    try {
      const git = await this.getGitInstance(repositoryPath);
      await git.removeRemote(name);
      
      logger.info(`Removed remote ${name}`);
      return true;
    } catch (error) {
      logger.error(`Failed to remove remote ${name}:`, error);
      throw error;
    }
  }

  // Utility methods for common workflows
  async createFeatureBranch(repositoryPath, featureName, baseBranch = 'main') {
    const branchName = `feature/${featureName}`;
    return await this.createBranch(repositoryPath, branchName, baseBranch);
  }

  async createBugfixBranch(repositoryPath, bugName, baseBranch = 'main') {
    const branchName = `bugfix/${bugName}`;
    return await this.createBranch(repositoryPath, branchName, baseBranch);
  }

  async commitAndPush(repositoryPath, message, files = [], author = null) {
    await this.addFiles(repositoryPath, files);
    await this.commit(repositoryPath, message, author);
    await this.push(repositoryPath);
    return true;
  }

  async isClean(repositoryPath) {
    const status = await this.getStatus(repositoryPath);
    return status.staged.length === 0 && 
           status.modified.length === 0 && 
           status.created.length === 0 && 
           status.deleted.length === 0;
  }

  async getCurrentBranch(repositoryPath) {
    const status = await this.getStatus(repositoryPath);
    return status.current;
  }

  async branchExists(repositoryPath, branchName) {
    try {
      const branches = await this.getBranches(repositoryPath);
      return branches.all.includes(branchName);
    } catch (error) {
      return false;
    }
  }
}

module.exports = new GitService();