#!/usr/bin/env node

const fs = require('fs');
const { execSync } = require('child_process');

// Conventional commit types
const COMMIT_TYPES = {
  feat: { emoji: '✨', title: 'Features' },
  fix: { emoji: '🐛', title: 'Bug Fixes' },
  docs: { emoji: '📚', title: 'Documentation' },
  style: { emoji: '💄', title: 'Styles' },
  refactor: { emoji: '♻️', title: 'Code Refactoring' },
  perf: { emoji: '⚡', title: 'Performance Improvements' },
  test: { emoji: '🚨', title: 'Tests' },
  build: { emoji: '📦', title: 'Builds' },
  ci: { emoji: '👷', title: 'Continuous Integration' },
  chore: { emoji: '🔧', title: 'Chores' },
  revert: { emoji: '⏪', title: 'Reverts' }
};

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  yellow: '\x1b[33m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function getGitCommits(fromTag, toTag = 'HEAD') {
  try {
    const range = fromTag ? `${fromTag}..${toTag}` : toTag;
    const commits = execSync(
      `git log ${range} --pretty=format:"%H|%s|%b|%an|%ad" --date=short --no-merges`,
      { encoding: 'utf8' }
    );
    return commits.trim().split('\n').filter(Boolean);
  } catch (err) {
    log('No commits found or invalid tag range', 'yellow');
    return [];
  }
}

function parseCommit(commitLine) {
  const [hash, subject, body, author, date] = commitLine.split('|');
  
  // Parse conventional commit format
  const conventionalMatch = subject.match(/^(\w+)(?:\(([\w\-]+)\))?:\s*(.+)$/);
  
  if (conventionalMatch) {
    const [, type, scope, description] = conventionalMatch;
    return {
      hash: hash.substring(0, 8),
      type: type.toLowerCase(),
      scope,
      description,
      body: body.trim(),
      author,
      date,
      breaking: body.includes('BREAKING CHANGE:') || subject.includes('!')
    };
  }
  
  // Fallback for non-conventional commits
  return {
    hash: hash.substring(0, 8),
    type: 'chore',
    scope: null,
    description: subject,
    body: body.trim(),
    author,
    date,
    breaking: false
  };
}

function groupCommitsByType(commits) {
  const groups = {};
  
  commits.forEach(commit => {
    const type = commit.type;
    if (!groups[type]) {
      groups[type] = [];
    }
    groups[type].push(commit);
  });
  
  return groups;
}

function generateChangelogContent(version, commits, previousVersion = null) {
  let content = `# Changelog\n\n`;
  content += `All notable changes to this project will be documented in this file.\n\n`;
  content += `The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),\n`;
  content += `and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).\n\n`;
  
  if (previousVersion) {
    content += `## [${version}] - ${new Date().toISOString().split('T')[0]}\n\n`;
  } else {
    content += `## [Unreleased]\n\n`;
  }
  
  const groupedCommits = groupCommitsByType(commits);
  const breakingChanges = commits.filter(commit => commit.breaking);
  
  // Breaking changes first
  if (breakingChanges.length > 0) {
    content += `### ⚠️ Breaking Changes\n\n`;
    breakingChanges.forEach(commit => {
      content += `- **${commit.description}** ([${commit.hash}](https://github.com/curtismu7/pingone-user-management-app/commit/${commit.hash}))\n`;
      if (commit.body) {
        const breakingNote = commit.body.match(/BREAKING CHANGE:\s*(.+)/);
        if (breakingNote) {
          content += `  - ${breakingNote[1]}\n`;
        }
      }
    });
    content += `\n`;
  }
  
  // Group by commit type
  Object.keys(COMMIT_TYPES).forEach(type => {
    if (groupedCommits[type] && groupedCommits[type].length > 0) {
      const typeInfo = COMMIT_TYPES[type];
      content += `### ${typeInfo.emoji} ${typeInfo.title}\n\n`;
      
      groupedCommits[type].forEach(commit => {
        const scope = commit.scope ? `**${commit.scope}:** ` : '';
        content += `- ${scope}${commit.description} ([${commit.hash}](https://github.com/curtismu7/pingone-user-management-app/commit/${commit.hash}))\n`;
      });
      content += `\n`;
    }
  });
  
  // Other commits
  const otherCommits = commits.filter(commit => !COMMIT_TYPES[commit.type]);
  if (otherCommits.length > 0) {
    content += `### 📝 Other Changes\n\n`;
    otherCommits.forEach(commit => {
      content += `- ${commit.description} ([${commit.hash}](https://github.com/curtismu7/pingone-user-management-app/commit/${commit.hash}))\n`;
    });
    content += `\n`;
  }
  
  if (previousVersion) {
    content += `[${version}]: https://github.com/curtismu7/pingone-user-management-app/compare/${previousVersion}...${version}\n`;
  }
  
  return content;
}

function updateChangelogFile(content, append = false) {
  const changelogPath = 'CHANGELOG.md';
  
  if (append && fs.existsSync(changelogPath)) {
    const existingContent = fs.readFileSync(changelogPath, 'utf8');
    const lines = existingContent.split('\n');
    
    // Find the line after the header
    let insertIndex = 0;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('## [Unreleased]')) {
        insertIndex = i;
        break;
      }
    }
    
    // Insert new content after the header
    const newLines = content.split('\n');
    lines.splice(insertIndex + 1, 0, ...newLines.slice(8)); // Skip the header part
    
    fs.writeFileSync(changelogPath, lines.join('\n'));
  } else {
    fs.writeFileSync(changelogPath, content);
  }
  
  log(`✅ Updated ${changelogPath}`, 'green');
}

function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    log('Usage: node scripts/changelog.js <version> [previous_version] [--append]', 'blue');
    log('', 'blue');
    log('Examples:', 'blue');
    log('  node scripts/changelog.js 1.0.0', 'blue');
    log('  node scripts/changelog.js 1.1.0 1.0.0', 'blue');
    log('  node scripts/changelog.js 1.0.0 --append', 'blue');
    process.exit(0);
  }
  
  const version = args[0];
  const previousVersion = args[1] && !args[1].startsWith('--') ? args[1] : null;
  const append = args.includes('--append');
  
  log(`Generating changelog for version ${version}...`, 'blue');
  
  const commits = getGitCommits(previousVersion, 'HEAD');
  
  if (commits.length === 0) {
    log('No commits found for the specified range', 'yellow');
    process.exit(0);
  }
  
  const parsedCommits = commits.map(parseCommit);
  const content = generateChangelogContent(version, parsedCommits, previousVersion);
  
  updateChangelogFile(content, append);
  
  log(`Generated changelog with ${parsedCommits.length} commits`, 'green');
}

// Run the script
if (require.main === module) {
  main();
}

module.exports = {
  getGitCommits,
  parseCommit,
  groupCommitsByType,
  generateChangelogContent,
  updateChangelogFile
}; 