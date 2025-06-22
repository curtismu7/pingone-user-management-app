#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Version types
const VERSION_TYPES = {
  MAJOR: 'major',
  MINOR: 'minor',
  PATCH: 'patch'
};

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function error(message) {
  log(`❌ ${message}`, 'red');
  process.exit(1);
}

function success(message) {
  log(`✅ ${message}`, 'green');
}

function info(message) {
  log(`ℹ️  ${message}`, 'blue');
}

function warning(message) {
  log(`⚠️  ${message}`, 'yellow');
}

// Get current version from package.json
function getCurrentVersion() {
  try {
    const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    return packageJson.version;
  } catch (err) {
    error('Could not read package.json');
  }
}

// Update version in package.json
function updateVersion(newVersion) {
  try {
    const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    packageJson.version = newVersion;
    fs.writeFileSync('package.json', JSON.stringify(packageJson, null, 2) + '\n');
    success(`Updated package.json version to ${newVersion}`);
  } catch (err) {
    error('Could not update package.json');
  }
}

// Calculate new version based on type
function calculateNewVersion(currentVersion, versionType) {
  const [major, minor, patch] = currentVersion.split('.').map(Number);
  
  switch (versionType) {
    case VERSION_TYPES.MAJOR:
      return `${major + 1}.0.0`;
    case VERSION_TYPES.MINOR:
      return `${major}.${minor + 1}.0`;
    case VERSION_TYPES.PATCH:
      return `${major}.${minor}.${patch + 1}`;
    default:
      error(`Invalid version type: ${versionType}`);
  }
}

// Check if working directory is clean
function checkWorkingDirectory() {
  try {
    const status = execSync('git status --porcelain', { encoding: 'utf8' });
    if (status.trim()) {
      warning('Working directory is not clean. Please commit or stash changes before versioning.');
      log('Current changes:', 'yellow');
      log(status, 'yellow');
      return false;
    }
    return true;
  } catch (err) {
    error('Could not check git status');
  }
}

// Create git tag
function createTag(version) {
  try {
    execSync(`git tag -a v${version} -m "Release version ${version}"`, { stdio: 'inherit' });
    success(`Created git tag v${version}`);
  } catch (err) {
    error(`Could not create git tag: ${err.message}`);
  }
}

// Push changes and tags to remote
function pushToRemote() {
  try {
    execSync('git push origin master', { stdio: 'inherit' });
    execSync('git push origin --tags', { stdio: 'inherit' });
    success('Pushed changes and tags to remote repository');
  } catch (err) {
    error(`Could not push to remote: ${err.message}`);
  }
}

// Create release notes
function createReleaseNotes(version, versionType) {
  const releaseNotesPath = `RELEASE_NOTES_${version}.md`;
  
  let notes = `# Release v${version}\n\n`;
  notes += `## Version Type: ${versionType.toUpperCase()}\n\n`;
  notes += `## Changes\n\n`;
  notes += `### Added\n- \n\n`;
  notes += `### Changed\n- \n\n`;
  notes += `### Fixed\n- \n\n`;
  notes += `### Removed\n- \n\n`;
  notes += `## Migration Notes\n\n`;
  notes += `## Breaking Changes\n\n`;
  notes += `## Contributors\n\n`;
  
  try {
    fs.writeFileSync(releaseNotesPath, notes);
    success(`Created release notes: ${releaseNotesPath}`);
  } catch (err) {
    warning(`Could not create release notes: ${err.message}`);
  }
}

// Main function
function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    log('Usage: node scripts/version.js <version_type> [--push] [--notes]', 'cyan');
    log('Version types: major, minor, patch', 'cyan');
    log('Options:', 'cyan');
    log('  --push    Push changes and tags to remote repository', 'cyan');
    log('  --notes   Create release notes template', 'cyan');
    log('', 'cyan');
    log('Examples:', 'cyan');
    log('  node scripts/version.js patch', 'cyan');
    log('  node scripts/version.js minor --push', 'cyan');
    log('  node scripts/version.js major --push --notes', 'cyan');
    process.exit(0);
  }
  
  const versionType = args[0].toLowerCase();
  const shouldPush = args.includes('--push');
  const shouldCreateNotes = args.includes('--notes');
  
  if (!Object.values(VERSION_TYPES).includes(versionType)) {
    error(`Invalid version type: ${versionType}. Use: major, minor, or patch`);
  }
  
  info('Starting version bump process...');
  
  // Check working directory
  if (!checkWorkingDirectory()) {
    process.exit(1);
  }
  
  // Get current version
  const currentVersion = getCurrentVersion();
  info(`Current version: ${currentVersion}`);
  
  // Calculate new version
  const newVersion = calculateNewVersion(currentVersion, versionType);
  info(`New version: ${newVersion}`);
  
  // Update package.json
  updateVersion(newVersion);
  
  // Create git tag
  createTag(newVersion);
  
  // Create release notes if requested
  if (shouldCreateNotes) {
    createReleaseNotes(newVersion, versionType);
  }
  
  // Push to remote if requested
  if (shouldPush) {
    pushToRemote();
  } else {
    info('To push changes and tags, run:');
    log(`  git push origin master`, 'cyan');
    log(`  git push origin --tags`, 'cyan');
  }
  
  success(`Version bump completed! New version: ${newVersion}`);
  
  if (shouldCreateNotes) {
    info('Remember to update the release notes with actual changes before creating a GitHub release.');
  }
}

// Run the script
if (require.main === module) {
  main();
}

module.exports = {
  VERSION_TYPES,
  getCurrentVersion,
  updateVersion,
  calculateNewVersion,
  createTag,
  pushToRemote,
  createReleaseNotes
}; 