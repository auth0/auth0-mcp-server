# Auth0 MCP Server Docker Image
FROM node:18-alpine

# Install the published package globally
RUN npm install -g @auth0/auth0-mcp-server

# Set the node user for security
USER node

# Expose no ports (MCP communicates via stdio)

# Set entrypoint to run the MCP server
ENTRYPOINT ["auth0-mcp"]

# Default command (can be overridden with args like --read-only, --tools, etc.)
CMD ["run"]
