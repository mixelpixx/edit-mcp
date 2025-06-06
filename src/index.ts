#!/usr/bin/env node

import * as path from 'path';
import * as fs from 'fs';
import { Command } from 'commander';
import chalk from 'chalk';

import { MCPServer } from './core/mcp-server';
import { FileSystemManager } from './file-system/file-system-manager';
import { EditInstanceManager } from './edit-instance/edit-instance-manager';
import { OperationRouter } from './router/operation-router';
import { Tool } from './core/mcp-types';
import { HttpServer } from './http/http-server';

// Define the program version
const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));
const version = packageJson.version;

// Create the command line interface
const program = new Command();

program
  .name('edit-mcp')
  .description('Model Context Protocol server for Microsoft Edit')
  .version(version)
  .option('-p, --port <port>', 'Port to listen on for HTTP transport', '3000')
  .option('-e, --edit-path <path>', 'Path to the Edit executable')
  .option('-m, --max-instances <number>', 'Maximum number of Edit instances', '5')
  .option('-t, --timeout <milliseconds>', 'Timeout for Edit instances in milliseconds', '300000')
  .option('-c, --config <path>', 'Path to configuration file')
  .option('-d, --debug', 'Enable debug logging')
  .option('-s, --stdio', 'Use stdio transport instead of HTTP')
  .parse(process.argv);

const options = program.opts();

// Load configuration
let config: any = {
  editExecutable: options.editPath,
  maxEditInstances: parseInt(options.maxInstances, 10),
  instanceTimeout: parseInt(options.timeout, 10),
  port: parseInt(options.port, 10),
  debug: options.debug,
  useStdio: options.stdio
};

if (options.config) {
  try {
    const configFile = fs.readFileSync(options.config, 'utf8');
    const fileConfig = JSON.parse(configFile);
    config = { ...config, ...fileConfig };
  } catch (error) {
    console.error(chalk.red(`Error loading configuration file: ${error}`));
    process.exit(1);
  }
}

// Set up logging
const log = {
  info: (message: string) => console.log(chalk.blue(`[INFO] ${message}`)),
  warn: (message: string) => console.warn(chalk.yellow(`[WARN] ${message}`)),
  error: (message: string) => console.error(chalk.red(`[ERROR] ${message}`)),
  debug: (message: string) => {
    if (config.debug) {
      console.log(chalk.gray(`[DEBUG] ${message}`));
    }
  }
};

// Initialize the MCP server components
async function initServer() {
  log.info('Initializing Edit-MCP server...');

  // Create the file system manager
  const fileSystemManager = new FileSystemManager();
  log.debug('File system manager initialized');

  // Create the Edit instance manager
  const editInstanceManager = new EditInstanceManager(
    config.editExecutable,
    config.maxEditInstances,
    config.instanceTimeout
  );
  log.debug('Edit instance manager initialized');

  // Create the operation router
  const operationRouter = new OperationRouter(
    fileSystemManager,
    editInstanceManager,
    config.simpleOperationThreshold || 1000,
    config.complexityFactors
  );
  log.debug('Operation router initialized');

  // Create the MCP server
  const mcpServer = new MCPServer({
    name: 'Edit-MCP',
    version,
    editExecutablePath: config.editExecutable,
    maxEditInstances: config.maxEditInstances,
    instanceTimeout: config.instanceTimeout,
    instructions: 'Edit-MCP provides file editing capabilities through Microsoft Edit'
  });
  log.debug('MCP server initialized');

  // Register file system tools
  registerFileSystemTools(mcpServer);
  log.debug('File system tools registered');

  // Register Edit tools
  registerEditTools(mcpServer);
  log.debug('Edit tools registered');

  // Register hybrid tools
  registerHybridTools(mcpServer, operationRouter);
  log.debug('Hybrid tools registered');

  // Start the server
  if (config.useStdio) {
    startStdioServer(mcpServer);
  } else {
    await startHttpServer(mcpServer, config.port);
  }

  // Handle process termination
  process.on('SIGINT', () => {
    log.info('Shutting down...');
    editInstanceManager.dispose();
    fileSystemManager.dispose();
    process.exit(0);
  });
}

// Register file system tools
function registerFileSystemTools(mcpServer: MCPServer) {
  // Read file tool
  mcpServer.registerTool({
    name: 'read_file',
    description: 'Read the contents of a file',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the file to read'
        },
        encoding: {
          type: 'string',
          description: 'Encoding to use when reading the file (default: utf8)'
        }
      },
      required: ['path']
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: false
    }
  });

  // Write file tool
  mcpServer.registerTool({
    name: 'write_file',
    description: 'Write content to a file',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the file to write'
        },
        content: {
          type: 'string',
          description: 'Content to write to the file'
        },
        encoding: {
          type: 'string',
          description: 'Encoding to use when writing the file (default: utf8)'
        }
      },
      required: ['path', 'content']
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false
    }
  });

  // List files tool
  mcpServer.registerTool({
    name: 'list_files',
    description: 'List files in a directory',
    inputSchema: {
      type: 'object',
      properties: {
        directory: {
          type: 'string',
          description: 'Path to the directory to list files from'
        },
        pattern: {
          type: 'string',
          description: 'Pattern to filter files by (e.g., *.txt)'
        }
      },
      required: ['directory']
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: false
    }
  });

  // Find in file tool
  mcpServer.registerTool({
    name: 'find_in_file',
    description: 'Find occurrences of a pattern in a file',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the file to search in'
        },
        pattern: {
          type: 'string',
          description: 'Regular expression pattern to search for'
        },
        contextLines: {
          type: 'number',
          description: 'Number of context lines to include before and after matches (default: 2)'
        }
      },
      required: ['path', 'pattern']
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: false
    }
  });
}

// Register Edit tools
function registerEditTools(mcpServer: MCPServer) {
  // Format code tool
  mcpServer.registerTool({
    name: 'format_code',
    description: 'Format code in a file',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the file to format'
        },
        language: {
          type: 'string',
          description: 'Language of the code (e.g., javascript, python, rust)'
        }
      },
      required: ['path']
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    }
  });

  // Complex find and replace tool
  mcpServer.registerTool({
    name: 'complex_find_replace',
    description: 'Perform advanced find and replace operations with context awareness',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the file to perform find and replace on'
        },
        pattern: {
          type: 'string',
          description: 'Regular expression pattern to search for'
        },
        replacement: {
          type: 'string',
          description: 'Replacement text'
        },
        options: {
          type: 'object',
          description: 'Additional options for the find and replace operation'
        }
      },
      required: ['path', 'pattern', 'replacement']
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false
    }
  });

  // Interactive edit session tool
  mcpServer.registerTool({
    name: 'interactive_edit_session',
    description: 'Start an interactive editing session for complex edits',
    inputSchema: {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          description: 'List of files to edit'
        },
        instructions: {
          type: 'string',
          description: 'Instructions for the editing session'
        }
      },
      required: ['files']
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false
    }
  });
}

// Register hybrid tools
function registerHybridTools(mcpServer: MCPServer, operationRouter: OperationRouter) {
  // Smart refactor tool
  mcpServer.registerTool({
    name: 'smart_refactor',
    description: 'Intelligently refactor code by renaming symbols across multiple files',
    inputSchema: {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          description: 'List of files to search and refactor'
        },
        oldName: {
          type: 'string',
          description: 'The symbol name to replace'
        },
        newName: {
          type: 'string',
          description: 'The new symbol name'
        }
      },
      required: ['files', 'oldName', 'newName']
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false
    }
  });

  // Backup and edit tool
  mcpServer.registerTool({
    name: 'backup_and_edit',
    description: 'Create backups of files before editing them',
    inputSchema: {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          description: 'List of files to backup and edit'
        },
        operation: {
          type: 'object',
          description: 'The edit operation to perform'
        }
      },
      required: ['files', 'operation']
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false
    }
  });
}

// Start the server using stdio transport
function startStdioServer(mcpServer: MCPServer) {
  log.info('Starting Edit-MCP server with stdio transport...');

  // Set up stdin/stdout handling
  process.stdin.setEncoding('utf8');
  
  let buffer = '';
  
  process.stdin.on('data', async (chunk: string) => {
    buffer += chunk;
    
    // Process complete messages
    const messages = buffer.split('\n');
    buffer = messages.pop() || '';
    
    for (const message of messages) {
      if (message.trim()) {
        try {
          const response = await mcpServer.handleMessage(message);
          
          if (response) {
            process.stdout.write(response + '\n');
          }
        } catch (error) {
          log.error(`Error handling message: ${error}`);
        }
      }
    }
  });
  
  process.stdin.on('end', () => {
    log.info('Stdin stream ended, shutting down...');
    process.exit(0);
  });
  
  log.info('Edit-MCP server started with stdio transport');
}

// Start the server using HTTP transport
async function startHttpServer(mcpServer: MCPServer, port: number) {
  log.info(`Starting Edit-MCP server with HTTP transport on port ${port}...`);
  
  const httpServer = new HttpServer(mcpServer, {
    port,
    corsOrigins: config.corsOrigins || ['*'],
    rateLimitWindowMs: config.rateLimitWindowMs,
    rateLimitMax: config.rateLimitMax,
    authEnabled: config.authEnabled || false,
    apiKey: config.apiKey
  });
  
  await httpServer.start();
  
  log.info(`Edit-MCP server started with HTTP transport on port ${port}`);
  log.info(`Server URL: http://localhost:${port}`);
  log.info(`API documentation: http://localhost:${port}/api/docs`);
  log.info(`Health check: http://localhost:${port}/health`);
}

// Start the server
initServer().catch(error => {
  log.error(`Failed to initialize server: ${error}`);
  process.exit(1);
});