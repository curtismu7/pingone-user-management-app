#!/usr/bin/env node

/**
 * Security Monitoring Script for PingOne User Management Application
 * 
 * This script monitors the application for security issues and provides
 * recommendations for improvement.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class SecurityMonitor {
  constructor() {
    this.issues = [];
    this.recommendations = [];
  }

  /**
   * Run all security checks
   */
  async runAllChecks() {
    console.log('🔒 Running Security Audit...\n');
    
    this.checkDependencies();
    this.checkEnvironmentVariables();
    this.checkFilePermissions();
    this.checkHardcodedSecrets();
    this.checkLogFiles();
    this.checkUploadDirectory();
    this.checkConfiguration();
    
    this.generateReport();
  }

  /**
   * Check for vulnerable dependencies
   */
  checkDependencies() {
    console.log('📦 Checking dependencies...');
    
    try {
      const auditResult = execSync('npm audit --json', { encoding: 'utf8' });
      const audit = JSON.parse(auditResult);
      
      if (audit.metadata.vulnerabilities.total > 0) {
        this.issues.push({
          type: 'dependency',
          severity: 'high',
          message: `${audit.metadata.vulnerabilities.total} vulnerabilities found in dependencies`,
          details: audit.metadata.vulnerabilities
        });
        
        this.recommendations.push('Run "npm audit fix" to fix vulnerabilities');
        this.recommendations.push('Consider updating @ping-identity/p14c-js-sdk-auth when available');
      } else {
        console.log('✅ No dependency vulnerabilities found');
      }
    } catch (error) {
      console.log('⚠️  Could not check dependencies');
    }
  }

  /**
   * Check environment variables
   */
  checkEnvironmentVariables() {
    console.log('🔐 Checking environment variables...');
    
    const envFile = path.join(process.cwd(), '.env');
    const envExample = path.join(process.cwd(), 'env.example');
    
    if (!fs.existsSync(envFile)) {
      this.issues.push({
        type: 'configuration',
        severity: 'high',
        message: '.env file not found',
        details: 'Create .env file with your PingOne credentials'
      });
      
      this.recommendations.push('Run "npm run setup" to create .env template');
    } else {
      const envContent = fs.readFileSync(envFile, 'utf8');
      
      // Check for placeholder values
      if (envContent.includes('your_environment_id_here') || 
          envContent.includes('your_client_id_here') || 
          envContent.includes('your_client_secret_here')) {
        this.issues.push({
          type: 'configuration',
          severity: 'high',
          message: 'Placeholder values found in .env file',
          details: 'Replace placeholder values with actual PingOne credentials'
        });
      } else {
        console.log('✅ Environment variables configured');
      }
    }
  }

  /**
   * Check file permissions
   */
  checkFilePermissions() {
    console.log('📁 Checking file permissions...');
    
    const sensitiveFiles = [
      '.env',
      'import-status.log',
      'uploads/'
    ];
    
    sensitiveFiles.forEach(file => {
      const filePath = path.join(process.cwd(), file);
      if (fs.existsSync(filePath)) {
        try {
          const stats = fs.statSync(filePath);
          const mode = stats.mode.toString(8);
          
          // Check if file is world-readable
          if (mode.endsWith('666') || mode.endsWith('777')) {
            this.issues.push({
              type: 'permissions',
              severity: 'medium',
              message: `${file} has overly permissive permissions`,
              details: `Current mode: ${mode}`
            });
            
            this.recommendations.push(`Set restrictive permissions on ${file}`);
          }
        } catch (error) {
          console.log(`⚠️  Could not check permissions for ${file}`);
        }
      }
    });
  }

  /**
   * Check for hardcoded secrets
   */
  checkHardcodedSecrets() {
    console.log('🔍 Checking for hardcoded secrets...');
    
    const filesToCheck = [
      'server.js',
      'server-enhanced.js',
      'get-worker-token.js',
      'services/auth.js'
    ];
    
    const secretPatterns = [
      /PINGONE_ENV_ID\s*=\s*['"][^'"]+['"]/,
      /CLIENT_ID\s*=\s*['"][^'"]+['"]/,
      /CLIENT_SECRET\s*=\s*['"][^'"]+['"]/,
      /ACCESS_TOKEN\s*=\s*['"][^'"]+['"]/,
      /eyJ[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+/ // JWT token pattern
    ];
    
    filesToCheck.forEach(file => {
      const filePath = path.join(process.cwd(), file);
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf8');
        
        secretPatterns.forEach(pattern => {
          const matches = content.match(pattern);
          if (matches) {
            this.issues.push({
              type: 'hardcoded_secret',
              severity: 'critical',
              message: `Hardcoded secret found in ${file}`,
              details: `Pattern: ${pattern.source}`
            });
            
            this.recommendations.push(`Remove hardcoded secrets from ${file}`);
          }
        });
      }
    });
    
    if (this.issues.filter(i => i.type === 'hardcoded_secret').length === 0) {
      console.log('✅ No hardcoded secrets found');
    }
  }

  /**
   * Check log files
   */
  checkLogFiles() {
    console.log('📝 Checking log files...');
    
    const logFile = path.join(process.cwd(), 'import-status.log');
    
    if (fs.existsSync(logFile)) {
      const stats = fs.statSync(logFile);
      const sizeInMB = stats.size / (1024 * 1024);
      
      if (sizeInMB > 50) {
        this.issues.push({
          type: 'logging',
          severity: 'medium',
          message: 'Log file is very large',
          details: `Size: ${sizeInMB.toFixed(2)}MB`
        });
        
        this.recommendations.push('Consider log rotation or cleanup');
      }
      
      // Check for sensitive data in logs
      const logContent = fs.readFileSync(logFile, 'utf8');
      if (logContent.includes('eyJ') || logContent.includes('client_secret')) {
        this.issues.push({
          type: 'logging',
          severity: 'high',
          message: 'Sensitive data found in log file',
          details: 'Credentials or tokens may be logged'
        });
        
        this.recommendations.push('Review and clean log file');
        this.recommendations.push('Ensure credentials are not logged');
      }
    }
  }

  /**
   * Check upload directory
   */
  checkUploadDirectory() {
    console.log('📤 Checking upload directory...');
    
    const uploadDir = path.join(process.cwd(), 'uploads');
    
    if (fs.existsSync(uploadDir)) {
      const files = fs.readdirSync(uploadDir);
      
      if (files.length > 0) {
        this.issues.push({
          type: 'uploads',
          severity: 'low',
          message: 'Upload directory contains files',
          details: `${files.length} files found`
        });
        
        this.recommendations.push('Consider cleaning upload directory');
        this.recommendations.push('Run "npm run clean" to remove uploads and logs');
      }
    }
  }

  /**
   * Check configuration
   */
  checkConfiguration() {
    console.log('⚙️  Checking configuration...');
    
    try {
      const { config } = require('../config');
      
      // Check for default values
      if (config.security.session.secret === 'your-secret-key-change-in-production') {
        this.issues.push({
          type: 'configuration',
          severity: 'medium',
          message: 'Default session secret in use',
          details: 'Change SESSION_SECRET in environment variables'
        });
        
        this.recommendations.push('Set a strong SESSION_SECRET in .env file');
      }
      
      if (config.server.environment === 'development') {
        this.recommendations.push('Set NODE_ENV=production for production deployment');
      }
      
    } catch (error) {
      console.log('⚠️  Could not check configuration');
    }
  }

  /**
   * Generate security report
   */
  generateReport() {
    console.log('\n📊 Security Report\n');
    console.log('='.repeat(50));
    
    if (this.issues.length === 0) {
      console.log('✅ No security issues found!');
    } else {
      console.log(`❌ Found ${this.issues.length} security issue(s):\n`);
      
      const critical = this.issues.filter(i => i.severity === 'critical');
      const high = this.issues.filter(i => i.severity === 'high');
      const medium = this.issues.filter(i => i.severity === 'medium');
      const low = this.issues.filter(i => i.severity === 'low');
      
      if (critical.length > 0) {
        console.log('🔴 CRITICAL ISSUES:');
        critical.forEach(issue => {
          console.log(`  - ${issue.message}`);
          if (issue.details) console.log(`    Details: ${issue.details}`);
        });
        console.log('');
      }
      
      if (high.length > 0) {
        console.log('🟠 HIGH PRIORITY ISSUES:');
        high.forEach(issue => {
          console.log(`  - ${issue.message}`);
          if (issue.details) console.log(`    Details: ${issue.details}`);
        });
        console.log('');
      }
      
      if (medium.length > 0) {
        console.log('🟡 MEDIUM PRIORITY ISSUES:');
        medium.forEach(issue => {
          console.log(`  - ${issue.message}`);
          if (issue.details) console.log(`    Details: ${issue.details}`);
        });
        console.log('');
      }
      
      if (low.length > 0) {
        console.log('🟢 LOW PRIORITY ISSUES:');
        low.forEach(issue => {
          console.log(`  - ${issue.message}`);
          if (issue.details) console.log(`    Details: ${issue.details}`);
        });
        console.log('');
      }
    }
    
    if (this.recommendations.length > 0) {
      console.log('💡 RECOMMENDATIONS:');
      this.recommendations.forEach(rec => {
        console.log(`  - ${rec}`);
      });
      console.log('');
    }
    
    console.log('='.repeat(50));
    console.log('🔗 For more information, see SECURITY.md');
  }
}

// Run the security monitor
if (require.main === module) {
  const monitor = new SecurityMonitor();
  monitor.runAllChecks().catch(console.error);
}

module.exports = SecurityMonitor; 