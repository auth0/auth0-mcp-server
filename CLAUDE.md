# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Test Commands

- Build: `npm run build` (includes format, lint, and TypeScript compilation)
- Dev mode: `npm run dev`
- Debug mode: `npm run dev:debug` (with DEBUG=auth0-mcp)
- Lint: `npm run lint` (fix with `npm run lint:fix`)
- Format: `npm run format`
- Test: `npm run test`
- Test single file: `npm test -- test/path/to/file.test.ts`
- Test with coverage: `npm run test:coverage`

## Code Style Guidelines

- **TypeScript**: Strict mode, ES2022 target with Node.js module resolution
- **Imports**: Use type imports with `import type`, avoid duplicate imports
- **Error Handling**: Catch and log errors with utils/logger.ts functions
- **Naming**: camelCase for variables/functions, PascalCase for classes/types
- **Types**: Explicit typing preferred except for obvious return types
- **No console**: Use logger module instead of direct console usage
- **Formatting**: Prettier for auto-formatting (npm run format)
- **Testing**: Vitest framework with mocks and descriptive test naming
- **Variables**: Use const by default, no var, avoid parameter reassignment
- **Async**: Don't use return await, handle Promise rejections properly
- **Security**: Prioritize security best practices, especially in authentication and authorization

## Commit Message Guidelines

Use conventional commits for commit messages. Be as descriptive as possible for all the changes, including bullets. Never include Claude Code attribution in 
commit messages.

## PR Guidelines

- Use the PR template in `.github/PULL_REQUEST_TEMPLATE.md`
