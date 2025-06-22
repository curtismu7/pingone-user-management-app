# Versioning Guide

This document describes the versioning system used in the PingOne User Management Application.

## Overview

We use [Semantic Versioning](https://semver.org/) (SemVer) for versioning our releases. The version format is `MAJOR.MINOR.PATCH`:

- **MAJOR**: Breaking changes that require migration
- **MINOR**: New features that are backward compatible
- **PATCH**: Bug fixes and minor improvements

## Current Version

Current version: `0.0.3`

## Quick Start

### Bump Version and Create Release

```bash
# Patch release (bug fixes)
npm run version:patch:release

# Minor release (new features)
npm run version:minor:release

# Major release (breaking changes)
npm run version:major:release
```

### Manual Version Bumping

```bash
# Bump version only (no push)
npm run version:patch
npm run version:minor
npm run version:major

# Bump version and push to GitHub
npm run version:patch:push
npm run version:minor:push
npm run version:major:push
```

## Versioning Scripts

### `scripts/version.js`

The main versioning script that handles:

- Semantic version calculation
- Package.json version updates
- Git tagging
- GitHub push operations
- Release notes generation

**Usage:**
```bash
node scripts/version.js <version_type> [--push] [--notes]
```

**Options:**
- `version_type`: `major`, `minor`, or `patch`
- `--push`: Push changes and tags to GitHub
- `--notes`: Generate release notes template

### `scripts/changelog.js`

Generates a CHANGELOG.md file from git commits using conventional commit format.

**Usage:**
```bash
node scripts/changelog.js <version> [previous_version] [--append]
```

## Conventional Commits

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification for commit messages:

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

### Commit Types

- `feat`: New features
- `fix`: Bug fixes
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `perf`: Performance improvements
- `test`: Adding or updating tests
- `build`: Build system changes
- `ci`: CI/CD changes
- `chore`: Maintenance tasks
- `revert`: Reverting previous commits

### Examples

```bash
# Feature commit
git commit -m "feat: add user import functionality"

# Bug fix with scope
git commit -m "fix(auth): resolve token refresh issue"

# Breaking change
git commit -m "feat!: change API response format

BREAKING CHANGE: API now returns JSON instead of XML"

# Documentation
git commit -m "docs: update installation instructions"
```

## Release Process

### 1. Prepare Release

```bash
# Generate changelog and create release
npm run release:prepare
```

This command:
1. Generates a changelog from commits since the last release
2. Bumps the patch version
3. Creates a git tag
4. Pushes to GitHub
5. Triggers GitHub Actions release workflow

### 2. GitHub Actions Release

When a tag is pushed, the GitHub Actions workflow automatically:

1. Runs security audit
2. Validates configuration
3. Creates a GitHub release
4. Uploads release assets
5. Generates release notes

### 3. Manual Release (if needed)

```bash
# 1. Update version
npm run version:patch

# 2. Generate changelog
npm run changelog:generate

# 3. Commit changes
git add .
git commit -m "chore: prepare release v0.0.4"

# 4. Push to GitHub
git push origin master
git push origin --tags
```

## Version History

| Version | Date | Type | Description |
|---------|------|------|-------------|
| 0.0.3 | Current | - | Initial versioning setup |
| 0.0.2 | - | - | Previous version |
| 0.0.1 | - | - | Initial release |

## Best Practices

### When to Bump Versions

- **PATCH** (0.0.x): Bug fixes, security patches, minor improvements
- **MINOR** (0.x.0): New features, backward-compatible changes
- **MAJOR** (x.0.0): Breaking changes, major refactoring

### Commit Message Guidelines

1. Use conventional commit format
2. Be descriptive but concise
3. Reference issues when applicable
4. Use present tense ("add" not "added")
5. Use imperative mood ("move" not "moves")

### Release Checklist

- [ ] All tests pass
- [ ] Security audit clean
- [ ] Documentation updated
- [ ] Changelog generated
- [ ] Version bumped
- [ ] Git tag created
- [ ] Pushed to GitHub
- [ ] GitHub release created

## Troubleshooting

### Common Issues

**Working directory not clean:**
```bash
# Commit or stash changes first
git add .
git commit -m "chore: prepare for release"
```

**Tag already exists:**
```bash
# Delete local tag
git tag -d v0.0.4

# Delete remote tag
git push origin :refs/tags/v0.0.4
```

**GitHub Actions failed:**
- Check the Actions tab in GitHub
- Verify GITHUB_TOKEN permissions
- Review workflow logs

### Getting Help

- Check the [GitHub repository](https://github.com/curtismu7/pingone-user-management-app)
- Review the [GitHub Actions workflow](.github/workflows/release.yml)
- Consult the [Semantic Versioning specification](https://semver.org/)

## Migration Guide

When upgrading between major versions, check the release notes for breaking changes and migration instructions.

## Contributing

When contributing to this project:

1. Follow the conventional commit format
2. Test your changes thoroughly
3. Update documentation as needed
4. Ensure the release process works correctly

For more information, see the [CONTRIBUTING.md](CONTRIBUTING.md) file. 