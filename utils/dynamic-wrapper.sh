#!/bin/bash

# Dynamic Wrapper for Auth0 MCP Server
# This wrapper script properly launches the server without storing tokens
# It sets up the environment for the server to fetch tokens dynamically

# Initialize with defaults
SERVER_PATH=$(dirname "$(realpath "$0")")
DEBUG_MODE=${AUTH0_MCP_DEBUG:-false}
DEBUG=${DEBUG:-false}
PORT=${SERVER_PORT:-4000}

# Determine CLI path based on debug mode
if [ "$DEBUG_MODE" = "true" ]; then
  # In debug mode, prefer local CLI path if available
  if [ -n "$AUTH0_CLI_PATH" ] && [ -f "$AUTH0_CLI_PATH" ]; then
    echo "Debug mode: Using local Auth0 CLI from AUTH0_CLI_PATH: $AUTH0_CLI_PATH"
  else
    # Try to find local CLI in development location
    REPO_ROOT=$(realpath "$SERVER_PATH/..")
    LOCAL_CLI_PATH="$REPO_ROOT/../auth0-cli/auth0"
    if [ -f "$LOCAL_CLI_PATH" ]; then
      export AUTH0_CLI_PATH="$LOCAL_CLI_PATH"
      echo "Debug mode: Found local Auth0 CLI at: $AUTH0_CLI_PATH"
    else
      # Fallback to global CLI in debug mode
      AUTH0_CLI_PATH=$(which auth0 2>/dev/null || echo "")
      if [ -n "$AUTH0_CLI_PATH" ]; then
        echo "Debug mode: Using global Auth0 CLI found in PATH: $AUTH0_CLI_PATH"
      else
        echo "Error: Auth0 CLI not found. Please install it or set AUTH0_CLI_PATH."
        exit 1
      fi
    fi
  fi
else
  # Production mode - prefer global CLI path
  AUTH0_CLI_PATH=${AUTH0_CLI_PATH:-$(which auth0 2>/dev/null || echo "")}
  if [ -z "$AUTH0_CLI_PATH" ]; then
    echo "Error: Auth0 CLI not found in PATH. Please install it or set AUTH0_CLI_PATH."
    exit 1
  fi
fi

NODE_PATH=${NODE_PATH:-$(which node)}

# Debug mode
if [ "$DEBUG" = "true" ] || [ "$DEBUG_MODE" = "true" ]; then
  echo "[DEBUG] NODE_PATH: $NODE_PATH"
  echo "[DEBUG] SERVER_PATH: $SERVER_PATH"
  echo "[DEBUG] AUTH0_CLI_PATH: $AUTH0_CLI_PATH"
  echo "[DEBUG] PORT: $PORT"
  echo "[DEBUG] Command line args: $@"
  export DEBUG=auth0-mcp:*
fi

# Check if Auth0 CLI exists and is executable
if [ ! -f "$AUTH0_CLI_PATH" ]; then
  echo "Error: Auth0 CLI not found at $AUTH0_CLI_PATH"
  exit 1
fi

if [ ! -x "$AUTH0_CLI_PATH" ]; then
  echo "Making Auth0 CLI executable: $AUTH0_CLI_PATH"
  chmod +x "$AUTH0_CLI_PATH"
fi

# Verify Auth0 CLI is authenticated
if [ "$DEBUG" = "true" ] || [ "$DEBUG_MODE" = "true" ]; then
  echo "[DEBUG] Checking Auth0 CLI authentication status..."
  "$AUTH0_CLI_PATH" tenants list || {
    echo "Warning: Auth0 CLI not authenticated or error running command"
    echo "You may need to run: $AUTH0_CLI_PATH login"
  }
fi

# Add Auth0 CLI to PATH for subprocess calls
export PATH="$(dirname "$AUTH0_CLI_PATH"):$PATH"

# Set environment variable for processes
export AUTH0_CLI_PATH="$AUTH0_CLI_PATH"

# Set debug mode environment variable
export AUTH0_MCP_DEBUG="$DEBUG_MODE"

# Get domain from CLI if not provided
if [ -z "$AUTH0_DOMAIN" ]; then
  TENANT_INFO=$("$AUTH0_CLI_PATH" tenants list --json 2>/dev/null)
  if [ -n "$TENANT_INFO" ] && [ "$?" = "0" ]; then
    # Extract domain from tenant info (using a simple grep approach for compatibility)
    # This extracts the "name" field of the active tenant or the first tenant
    ACTIVE_TENANT=$(echo "$TENANT_INFO" | grep -o '"name":"[^"]*"' | head -1 | cut -d'"' -f4)
    if [ -n "$ACTIVE_TENANT" ]; then
      export AUTH0_DOMAIN="$ACTIVE_TENANT"
      echo "Using domain from Auth0 CLI: $AUTH0_DOMAIN"
    fi
  fi
fi

# Set default domain if still not provided
export AUTH0_DOMAIN=${AUTH0_DOMAIN:-${2:-"your-tenant.auth0.com"}}

# Enable dynamic token retrieval
export AUTH0_TOKEN_DYNAMIC=true

# Start the Auth0 MCP Server
cd "$SERVER_PATH" || { echo "Error: Failed to change directory to $SERVER_PATH"; exit 1; }
echo "Starting Auth0 MCP server with domain: $AUTH0_DOMAIN"
echo "CLI path: $AUTH0_CLI_PATH"
if [ "$DEBUG_MODE" = "true" ]; then
  echo "Running in DEBUG mode"
else
  echo "Running in PRODUCTION mode"
fi

exec "$NODE_PATH" dist/index.js "$@"