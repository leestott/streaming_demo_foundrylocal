# Contributing to Foundry Local Streaming Validation

Thank you for your interest in contributing to this project! We welcome contributions from everyone.

## Getting Started

1. **Fork the repository** and clone it locally
2. **Install dependencies**: `npm install`
3. **Build the project**: `npm run build`
4. **Run tests**: Ensure Foundry Local is running, then `npm start`

## Development Workflow

### Project Structure

```
src/
├── index.ts           # CLI entry point
├── config.ts          # Configuration loader
├── report.ts          # Report generation
├── types.ts           # Shared types
├── benchmark/         # Multi-model benchmark runner
├── models/            # Model catalog and selection
├── probes/            # Individual probe implementations
├── sdk/               # Foundry Local SDK wrapper
├── service/           # Service detection
├── sse/               # SSE parser
├── utils/             # Utilities (hashing, timing, version)
└── web/               # Express web server and dashboard
```

### Running in Development

```bash
# CLI with auto-reload
npm run dev

# Web server with auto-reload
npm run web:dev
```

### Building

```bash
npm run build
```

### Code Style

- Use TypeScript for all source files
- Follow existing code conventions and patterns
- Add JSDoc comments for public functions
- Keep functions focused and single-purpose

## How to Contribute

### Reporting Issues

- Check existing issues before creating a new one
- Include steps to reproduce the issue
- Include your environment details (Node.js version, OS, Foundry Local version)
- Include relevant error messages and logs

### Submitting Pull Requests

1. Create a feature branch from `main`
2. Make your changes with clear, descriptive commits
3. Update documentation if needed
4. Test your changes with Foundry Local running
5. Submit a PR with a clear description of the changes

### Types of Contributions

We welcome:

- **Bug fixes**: Fix issues with existing functionality
- **New probes**: Add support for testing additional API patterns
- **UI improvements**: Enhance the web dashboard
- **Documentation**: Improve README, add examples, fix typos
- **Performance**: Optimize probe execution or reporting

## Code of Conduct

Please be respectful and constructive in all interactions. We are committed to providing a welcoming and inclusive environment for everyone.

## Questions?

If you have questions about contributing, feel free to open an issue for discussion.
