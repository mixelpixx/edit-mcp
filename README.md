# Edit-MCP: Model Context Protocol Server for Microsoft Edit


Edit-MCP is a Model Context Protocol (MCP) server that integrates with Microsoft's Edit tool to provide advanced file editing capabilities to AI systems. It follows a hybrid architecture that combines direct file system operations for performance with Microsoft Edit integration for complex editing tasks.

## Overview

The Edit-MCP server acts as a sophisticated coordinator between AI systems and file editing operations. It exposes a standardized MCP interface that allows AI models to:

- Read and write files
- Search and replace text
- Format code
- Perform complex editing operations
- Coordinate multi-file edits
- And more...

## Architecture

Edit-MCP follows a hybrid architecture with the following components:

### 1. Core MCP Server

- Handles MCP protocol communication
- Routes operations to appropriate subsystems
- Manages file state and metadata
- Coordinates between multiple Edit instances
- Provides caching and optimization

### 2. File System Manager

- Performs direct file operations for simple tasks
- Handles basic CRUD operations
- Provides text search and simple find/replace
- Manages file metadata operations
- Supports batch operations across multiple files

### 3. Edit Instance Manager

- Manages Microsoft Edit processes for complex operations
- Handles complex editing scenarios
- Coordinates multi-file operations
- Manages Edit's TUI interactions programmatically

### 4. Operation Router

- Decides which subsystem handles each operation
- Routes simple operations to File System Manager
- Routes complex operations to Edit Instance Manager
- Coordinates hybrid operations between both subsystems

## Installation

### Prerequisites

- Node.js 16 or higher
- Microsoft Edit installed and available in your PATH

### Install from Source

```bash
# Clone the repository
git clone https://github.com/username/edit-mcp.git
cd edit-mcp

# Install dependencies
npm install

# Build the project
npm run build
```

## Usage

### Starting the Server

You can start the Edit-MCP server using either stdio or HTTP transport:

```bash
# Start with stdio transport (for direct integration with AI systems)
npm run stdio

# Start with HTTP transport (for web-based integration)
npm run http
```

### Command Line Options

```
Usage: edit-mcp [options]

Options:
  -V, --version                output the version number
  -p, --port <port>            Port to listen on for HTTP transport (default: "3000")
  -e, --edit-path <path>       Path to the Edit executable
  -m, --max-instances <number> Maximum number of Edit instances (default: "5")
  -t, --timeout <milliseconds> Timeout for Edit instances in milliseconds (default: "300000")
  -c, --config <path>          Path to configuration file
  -d, --debug                  Enable debug logging
  -s, --stdio                  Use stdio transport instead of HTTP
  -h, --help                   display help for command
```

### Configuration

You can configure Edit-MCP using a JSON configuration file:

```json
{
  "editExecutable": "/path/to/edit",
  "maxEditInstances": 5,
  "instanceTimeout": 300000,
  "simpleOperationThreshold": 1000,
  "complexityFactors": {
    "fileSize": 0.3,
    "operationType": 0.4,
    "contextRequirement": 0.3
  }
}
```

## Available Tools

Edit-MCP provides the following tools:

### File System Tools

- `read_file`: Read the contents of a file
- `write_file`: Write content to a file
- `list_files`: List files in a directory
- `find_in_file`: Find occurrences of a pattern in a file

### Edit Tools

- `format_code`: Format code in a file
- `complex_find_replace`: Perform advanced find and replace operations
- `interactive_edit_session`: Start an interactive editing session

### Hybrid Tools

- `smart_refactor`: Intelligently refactor code across multiple files
- `backup_and_edit`: Create backups of files before editing them

## HTTP Transport

Edit-MCP now supports HTTP transport in addition to stdio, allowing remote access and REST API endpoints.

### Starting with HTTP Transport

```bash
# Start with default HTTP port (3000)
edit-mcp

# Start with custom port
edit-mcp --port 8080

# Start with configuration file
edit-mcp --config config.http.example.json
```

### REST API Endpoints

#### Health Check
```bash
GET /health
```

#### JSON-RPC Endpoint
```bash
POST /jsonrpc
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "read_file",
    "arguments": {
      "path": "example.txt"
    }
  },
  "id": 1
}
```

#### REST API Endpoints

- `GET /api/tools` - List available tools
- `POST /api/tools/:toolName` - Call a specific tool
- `GET /api/files/:path` - Read file content
- `PUT /api/files/:path` - Write file content
- `GET /api/list/:directory` - List files in directory
- `POST /api/search` - Search for patterns in files
- `POST /api/format` - Format code
- `POST /api/refactor` - Refactor symbols across files
- `GET /api/docs` - API documentation

### Authentication

Enable API key authentication by setting `authEnabled: true` in your config:

```json
{
  "authEnabled": true,
  "apiKey": "your-secure-api-key"
}
```

Include the API key in requests:
- Header: `X-API-Key: your-secure-api-key`
- Query parameter: `?apiKey=your-secure-api-key`

### CORS Configuration

Configure allowed origins in your config file:

```json
{
  "corsOrigins": ["http://localhost:*", "https://yourdomain.com"]
}
```

### Rate Limiting

Configure rate limiting to prevent abuse:

```json
{
  "rateLimitWindowMs": 900000,  // 15 minutes
  "rateLimitMax": 100           // 100 requests per window
}
```

## Development

### Building the Project

```bash
# Build the project
npm run build

# Watch for changes and rebuild
npm run watch
```

### Running in Development Mode

```bash
# Run with hot reloading
npm run dev
```

## License

MIT

## Acknowledgements

- Microsoft for the Edit tool
- The Model Context Protocol community
