# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.x.x   | :white_check_mark: |

## Reporting a Vulnerability

We take security vulnerabilities seriously. If you discover a security issue, please report it responsibly.

### How to Report

1. **Do not** open a public GitHub issue for security vulnerabilities
2. Email your findings to the repository maintainers
3. Include as much detail as possible:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

### What to Expect

- We will acknowledge receipt within 48 hours
- We will provide an initial assessment within 7 days
- We will work with you to understand and resolve the issue
- We will credit you in the fix (unless you prefer to remain anonymous)

## Security Best Practices

When using this tool:

### API Keys

- Never commit API keys to version control
- Use environment variables or `.env` files (which should be in `.gitignore`)
- Rotate API keys if they may have been exposed

### Network Security

- This tool connects to local Foundry Local service by default
- If exposing the web server externally, ensure proper authentication
- Use HTTPS in production environments

### Dependencies

- Regularly update dependencies with `npm update`
- Review dependency changes before updating
- Use `npm audit` to check for known vulnerabilities

## Scope

This security policy applies to:

- The foundry-local-streaming-validation codebase
- Official releases and builds

This policy does not cover:

- Third-party dependencies (report to their maintainers)
- Foundry Local service itself (report to Microsoft)
- User-modified or forked versions
