# Change Log

## [v0.1.0-beta.7](https://github.com/auth0/auth0-mcp-server/tree/v0.1.0-beta.7) (2025-09-08)
[Full Changelog](https://github.com/auth0/auth0-mcp-server/compare/v0.1.0-beta.6...v0.1.0-beta.7)

**Fixed**
- fix: update authorization_details schema to JSON Schema Draft 2020-12 compliance [\#67](https://github.com/auth0/auth0-mcp-server/pull/67) ([gyaneshgouraw-okta](https://github.com/gyaneshgouraw-okta))

## [v0.1.0-beta.6](https://github.com/auth0/auth0-mcp-server/tree/v0.1.0-beta.6) (2025-09-05)
[Full Changelog](https://github.com/auth0/auth0-mcp-server/compare/v0.1.0-beta.5...v0.1.0-beta.6)

**Fixed**
- Fix npm publish tag logic for beta versions [\#65](https://github.com/auth0/auth0-mcp-server/pull/65) ([gyaneshgouraw-okta](https://github.com/gyaneshgouraw-okta))

## [v0.1.0-beta.5](https://github.com/auth0/auth0-mcp-server/tree/v0.1.0-beta.5) (2025-09-05)
[Full Changelog](https://github.com/auth0/auth0-mcp-server/compare/v0.1.0-beta.4...v0.1.0-beta.5)

**Added**
- VS Code Improvements [\#63](https://github.com/auth0/auth0-mcp-server/pull/63) ([jtemporal](https://github.com/jtemporal))

## [v0.1.0-beta.4](https://github.com/auth0/auth0-mcp-server/tree/v0.1.0-beta.4) (2025-09-03)
[Full Changelog](https://github.com/auth0/auth0-mcp-server/compare/v0.1.0-beta.3...v0.1.0-beta.4)

**Added**
- Cursor button [\#51](https://github.com/auth0/auth0-mcp-server/pull/51) ([brth31](https://github.com/brth31))
- feat: authentication flow for Private Cloud [\#55](https://github.com/auth0/auth0-mcp-server/pull/55) ([kushalshit27](https://github.com/kushalshit27))

**Fixed**
- fix: vs-code validate tool error for resource_serve [\#46](https://github.com/auth0/auth0-mcp-server/pull/46) ([kushalshit27](https://github.com/kushalshit27))

## [v0.1.0-beta.3](https://github.com/auth0/auth0-mcp-server/tree/v0.1.0-beta.3) (2025-08-26)
[Full Changelog](https://github.com/auth0/auth0-mcp-server/compare/v0.1.0-beta.2...v0.1.0-beta.3)

**Added**
- Add to Cursor button [\#50](https://github.com/auth0/auth0-mcp-server/pull/50) ([brth31](https://github.com/brth31))
- docs: add DeepWiki badge to README.md [\#39](https://github.com/auth0/auth0-mcp-server/pull/39) ([btiernay](https://github.com/btiernay))
- docs: add security scanning section to README [\#40](https://github.com/auth0/auth0-mcp-server/pull/40) ([btiernay](https://github.com/btiernay))
- feat: update to 2025-03-26 schema and add support for annotations [\#26](https://github.com/auth0/auth0-mcp-server/pull/26) ([dennishenry](https://github.com/dennishenry))

**Fixed**
- fix: add item type definition for authorization_details in resource server tools [\#60](https://github.com/auth0/auth0-mcp-server/pull/60) ([gyaneshgouraw-okta](https://github.com/gyaneshgouraw-okta))

**Security**
- chore: validate token expiration to prevent using expired credent… [\#36](https://github.com/auth0/auth0-mcp-server/pull/36) ([btiernay](https://github.com/btiernay))
- feat: improve auth token validation for run command [\#29](https://github.com/auth0/auth0-mcp-server/pull/29) ([btiernay](https://github.com/btiernay))
- feat: add read-only CLI flag to restrict tool access [\#22](https://github.com/auth0/auth0-mcp-server/pull/22) ([btiernay](https://github.com/btiernay))

## [v0.1.0-beta.2](https://github.com/auth0/auth0-mcp-server/tree/v0.1.0-beta.2) (2025-04-24)

[Full Changelog](https://github.com/auth0/auth0-mcp-server/compare/v0.1.0-beta.1...v0.1.0-beta.2)

**Added**

- feat: add Anonymized analytics for mcp server [\#19](https://github.com/auth0/auth0-mcp-server/pull/19) ([kushalshit27](https://github.com/kushalshit27))
- feat: implement tool filtering with required --tools parameter [\#15](https://github.com/auth0/auth0-mcp-server/pull/15) ([btiernay](https://github.com/btiernay))

**Changed**

- refactor: package info management for consistency [\#20](https://github.com/auth0/auth0-mcp-server/pull/20) ([btiernay](https://github.com/btiernay))
- chore: update local setup details view [\#2](https://github.com/auth0/auth0-mcp-server/pull/2) ([kushalshit27](https://github.com/kushalshit27))
- feat: integrate commander.js for command processing [\#3](https://github.com/auth0/auth0-mcp-server/pull/3) ([btiernay](https://github.com/btiernay))

**Fixed**

- fix: update NPM downloads badge in README [\#18](https://github.com/auth0/auth0-mcp-server/pull/18) ([kushalshit27](https://github.com/kushalshit27))
- Fixed links in readme [\#14](https://github.com/auth0/auth0-mcp-server/pull/14) ([brth31](https://github.com/brth31))

## [v0.1.0-beta.1](https://github.com/auth0/auth0-mcp-server/tree/v0.0.1-beta.0) (2025-04-15)

### Added

- Beta release of Auth0 MCP Server
- MCP server implementation for Auth0 management operations
- Support for Claude Desktop and other MCP clients integration
- Auth0 management operations through natural language
- Device authorization flow for secure authentication
- Tools for managing applications, resource servers, actions, logs, and forms
