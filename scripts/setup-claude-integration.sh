#!/bin/bash

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== Auth0 MCP Server + Claude Desktop Integration Setup ===${NC}"
echo ""

# Get the absolute path of the auth0-mcp-server
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
SERVER_DIR="$( cd "$SCRIPT_DIR/.." &> /dev/null && pwd )"

# Build the auth0-mcp-server
echo "Building Auth0 MCP server..."
cd "$SERVER_DIR"
npm install
npm run build

if [ $? -ne 0 ]; then
    echo -e "${RED}Failed to build auth0-mcp-server. Please check the error messages above.${NC}"
    exit 1
fi

# Find node path
NODE_PATH=$(command -v node)
if [ -z "$NODE_PATH" ]; then
    echo -e "${RED}Node.js not found in PATH. Please install Node.js and try again.${NC}"
    exit 1
fi

# Check if auth0-cli is installed
if ! command -v auth0 &> /dev/null; then
    echo -e "${YELLOW}auth0-cli is not installed. Would you like to install it? (y/n)${NC}"
    read -r install_auth0
    if [[ "$install_auth0" =~ ^[Yy]$ ]]; then
        echo "Installing auth0-cli..."
        npm install -g auth0-cli
        if [ $? -ne 0 ]; then
            echo -e "${RED}Failed to install auth0-cli. Please install it manually: npm install -g auth0-cli${NC}"
            exit 1
        fi
    else
        echo -e "${RED}auth0-cli is required for this integration. Please install it and try again.${NC}"
        exit 1
    fi
fi

# Check if the auth0-cli has the claude command
if ! auth0 help | grep -q claude; then
    echo -e "${YELLOW}Your auth0-cli version doesn't have the claude command. You need to update it with the custom extension.${NC}"
    echo -e "${YELLOW}Please follow the instructions in the README to build the extended auth0-cli.${NC}"
    exit 1
fi

# Check if user is logged in to Auth0
echo "Checking Auth0 login status..."
if ! auth0 tenants list &> /dev/null; then
    echo -e "${YELLOW}You are not logged in to Auth0. Please login first:${NC}"
    auth0 login
    if [ $? -ne 0 ]; then
        echo -e "${RED}Auth0 login failed. Please try again manually.${NC}"
        exit 1
    fi
fi

# Configure Claude Desktop with auth0-cli
SERVER_ENTRY_POINT="$SERVER_DIR/dist/index.js"
echo -e "${GREEN}Configuring Claude Desktop with Auth0 credentials...${NC}"
auth0 claude configure --server-path "$SERVER_ENTRY_POINT" --node-path "$NODE_PATH"

if [ $? -ne 0 ]; then
    echo -e "${RED}Failed to configure Claude Desktop. Please try again manually.${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}=== Setup Complete! ===${NC}"
echo "You can now use Auth0 tools in Claude Desktop."
echo ""
echo "To use Claude with Auth0:"
echo "1. Open Claude Desktop"
echo "2. Create a new conversation"
echo "3. Try asking questions about your Auth0 tenant"
echo ""
echo -e "${YELLOW}Note: If you change your Auth0 tenant or your token expires, run:${NC}"
echo "auth0 login"
echo "auth0 claude configure --server-path \"$SERVER_ENTRY_POINT\" --node-path \"$NODE_PATH\""