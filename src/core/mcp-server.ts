import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import chalk from 'chalk';

import {
  JSONRPC_VERSION,
  LATEST_PROTOCOL_VERSION,
  JSONRPCRequest,
  JSONRPCResponse,
  JSONRPCError,
  JSONRPCNotification,
  RequestId,
  ServerCapabilities,
  Implementation,
  InitializeRequest,
  InitializeResult,
  Tool,
  Resource,
  TextResourceContents,
  BlobResourceContents,
  CallToolResult,
  TextContent,
  INVALID_PARAMS,
  METHOD_NOT_FOUND,
  INTERNAL_ERROR
} from './mcp-types';

import {
  createSuccessResponse,
  createErrorResponse,
  createNotification,
  createRequest,
  parseJsonRpc,
  isRequest,
  isNotification,
  getPayload
} from './jsonrpc-wrapper';

export interface MCPServerOptions {
  name: string;
  version: string;
  editExecutablePath?: string;
  maxEditInstances?: number;
  instanceTimeout?: number;
  capabilities?: Partial<ServerCapabilities>;
  instructions?: string;
}

export class MCPServer {
  private name: string;
  private version: string;
  private editExecutablePath: string;
  private maxEditInstances: number;
  private instanceTimeout: number;
  private capabilities: ServerCapabilities;
  private instructions?: string;
  private initialized = false;
  private requestHandlers: Map<string, (params: any) => Promise<any>> = new Map();
  private notificationHandlers: Map<string, (params: any) => void> = new Map();
  private tools: Map<string, Tool> = new Map();
  private resources: Map<string, Resource> = new Map();
  private editInstances: Map<string, ChildProcess> = new Map();
  private nextRequestId = 1;

  constructor(options: MCPServerOptions) {
    this.name = options.name;
    this.version = options.version;
    this.editExecutablePath = options.editExecutablePath || this.findEditExecutable();
    this.maxEditInstances = options.maxEditInstances || 5;
    this.instanceTimeout = options.instanceTimeout || 300000; // 5 minutes
    this.instructions = options.instructions;

    // Set up default capabilities
    this.capabilities = {
      resources: {
        subscribe: true,
        listChanged: true
      },
      tools: {
        listChanged: true
      },
      logging: {},
      ...options.capabilities
    };

    // Register core request handlers
    this.registerRequestHandler('initialize', this.handleInitialize.bind(this));
    this.registerRequestHandler('ping', this.handlePing.bind(this));
    this.registerRequestHandler('resources/list', this.handleResourcesList.bind(this));
    this.registerRequestHandler('resources/read', this.handleResourcesRead.bind(this));
    this.registerRequestHandler('tools/list', this.handleToolsList.bind(this));
    this.registerRequestHandler('tools/call', this.handleToolsCall.bind(this));

    // Register core notification handlers
    this.registerNotificationHandler('notifications/initialized', this.handleInitialized.bind(this));
  }

  /**
   * Attempts to find the Edit executable in common locations
   */
  private findEditExecutable(): string {
    // Check if the executable is in the PATH
    const isWindows = process.platform === 'win32';
    const executableName = isWindows ? 'edit.exe' : 'edit';
    
    // Common locations to check
    const commonLocations = [
      // Windows locations
      'C:\\Program Files\\Microsoft\\Edit\\edit.exe',
      'C:\\Program Files (x86)\\Microsoft\\Edit\\edit.exe',
      // Unix-like locations
      '/usr/bin/edit',
      '/usr/local/bin/edit',
      '/opt/microsoft/edit/edit'
    ];

    // First check if it's in the PATH
    try {
      const which = require('child_process').execSync(
        isWindows ? 'where edit' : 'which edit',
        { encoding: 'utf8' }
      ).trim();
      
      if (which && fs.existsSync(which)) {
        return which;
      }
    } catch (error) {
      // Not in PATH, continue checking common locations
    }

    // Check common locations
    for (const location of commonLocations) {
      if (fs.existsSync(location)) {
        return location;
      }
    }

    // Default to just the executable name and hope it's in the PATH
    return executableName;
  }

  /**
   * Registers a request handler for a specific method
   */
  public registerRequestHandler(method: string, handler: (params: any) => Promise<any>): void {
    this.requestHandlers.set(method, handler);
  }

  /**
   * Registers a notification handler for a specific method
   */
  public registerNotificationHandler(method: string, handler: (params: any) => void): void {
    this.notificationHandlers.set(method, handler);
  }

  /**
   * Registers a tool that can be called by clients
   */
  public registerTool(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }

  /**
   * Registers a resource that can be accessed by clients
   */
  public registerResource(resource: Resource): void {
    this.resources.set(resource.uri, resource);
  }

  /**
   * Handles an incoming JSON-RPC message
   */
  public async handleMessage(message: string): Promise<string | null> {
    try {
      const parsed = parseJsonRpc(message);
      
      if (Array.isArray(parsed)) {
        // Handle batch requests
        const responses = await Promise.all(
          parsed.map(item => this.processMessage(item))
        );
        
        // Filter out null responses (notifications)
        const validResponses = responses.filter(r => r !== null);
        
        if (validResponses.length === 0) {
          return null;
        }
        
        return JSON.stringify(validResponses);
      } else {
        // Handle single request
        const response = await this.processMessage(parsed);
        
        if (response === null) {
          return null;
        }
        
        return JSON.stringify(response);
      }
    } catch (error) {
      console.error('Error parsing JSON-RPC message:', error);
      
      // Return a parse error
      const errorResponse = createErrorResponse(null, 'Parse error', -32700);
      
      return JSON.stringify(errorResponse);
    }
  }

  /**
   * Processes a single parsed JSON-RPC message
   */
  private async processMessage(parsed: any): Promise<any | null> {
    if (isRequest(parsed)) {
      return await this.handleRequest(getPayload(parsed));
    } else if (isNotification(parsed)) {
      await this.handleNotification(getPayload(parsed));
      return null;
    } else {
      console.warn('Received an unexpected message type:', parsed.type);
      return null;
    }
  }

  /**
   * Handles a JSON-RPC request
   */
  private async handleRequest(request: JSONRPCRequest): Promise<any> {
    console.log(chalk.blue(`Received request: ${request.method}`));
    
    // Special case for initialize request
    if (request.method === 'initialize' && this.initialized) {
      return createErrorResponse(
        request.id,
        'Server is already initialized',
        INVALID_PARAMS
      );
    }
    
    // For all other requests, ensure the server is initialized
    if (request.method !== 'initialize' && !this.initialized) {
      return createErrorResponse(
        request.id,
        'Server is not initialized',
        INVALID_PARAMS
      );
    }
    
    const handler = this.requestHandlers.get(request.method);
    
    if (!handler) {
      return createErrorResponse(
        request.id,
        `Method not found: ${request.method}`,
        METHOD_NOT_FOUND
      );
    }
    
    try {
      const result = await handler(request.params || {});
      return createSuccessResponse(request.id, result);
    } catch (error: any) {
      console.error(`Error handling request ${request.method}:`, error);
      
      return createErrorResponse(
        request.id,
        error.message || 'Internal error',
        error.code || INTERNAL_ERROR,
        error.data
      );
    }
  }

  /**
   * Handles a JSON-RPC notification
   */
  private async handleNotification(notification: JSONRPCNotification): Promise<void> {
    console.log(chalk.green(`Received notification: ${notification.method}`));
    
    const handler = this.notificationHandlers.get(notification.method);
    
    if (!handler) {
      console.warn(`No handler registered for notification: ${notification.method}`);
      return;
    }
    
    try {
      await handler(notification.params || {});
    } catch (error) {
      console.error(`Error handling notification ${notification.method}:`, error);
    }
  }

  /**
   * Creates a JSON-RPC notification
   */
  public createNotification(method: string, params?: any): string {
    const notification = createNotification(method, params);
    return JSON.stringify(notification);
  }

  /**
   * Creates a JSON-RPC request
   */
  public createRequest(method: string, params?: any): { id: RequestId, message: string } {
    const id = this.nextRequestId++;
    const request = createRequest(id, method, params);
    return { id, message: JSON.stringify(request) };
  }

  /**
   * Handles the initialize request
   */
  private async handleInitialize(params: InitializeRequest['params']): Promise<InitializeResult> {
    console.log(chalk.yellow('Initializing server...'));
    console.log(`Client protocol version: ${params.protocolVersion}`);
    console.log(`Client info: ${params.clientInfo.name} ${params.clientInfo.version}`);
    
    return {
      protocolVersion: LATEST_PROTOCOL_VERSION,
      capabilities: this.capabilities,
      serverInfo: {
        name: this.name,
        version: this.version
      },
      instructions: this.instructions
    };
  }

  /**
   * Handles the initialized notification
   */
  private handleInitialized(params: any): void {
    console.log(chalk.yellow('Server initialized'));
    this.initialized = true;
  }

  /**
   * Handles the ping request
   */
  private async handlePing(): Promise<{}> {
    return {};
  }

  /**
   * Handles the resources/list request
   */
  private async handleResourcesList(params: any): Promise<{ resources: Resource[] }> {
    // In a real implementation, we would handle pagination here
    return {
      resources: Array.from(this.resources.values())
    };
  }

  /**
   * Handles the resources/read request
   */
  private async handleResourcesRead(params: { uri: string }): Promise<{ contents: (TextResourceContents | BlobResourceContents)[] }> {
    const { uri } = params;
    
    if (!uri) {
      throw new Error('URI is required');
    }
    
    const resource = this.resources.get(uri);
    
    if (!resource) {
      throw new Error(`Resource not found: ${uri}`);
    }
    
    // In a real implementation, we would read the resource content here
    // For now, we'll just return a placeholder
    
    return {
      contents: [
        {
          uri,
          mimeType: resource.mimeType || 'text/plain',
          text: `Content of ${uri}`
        } as TextResourceContents
      ]
    };
  }

  /**
   * Handles the tools/list request
   */
  private async handleToolsList(params: any): Promise<{ tools: Tool[] }> {
    // In a real implementation, we would handle pagination here
    return {
      tools: Array.from(this.tools.values())
    };
  }

  /**
   * Handles the tools/call request
   */
  private async handleToolsCall(params: { name: string, arguments?: any }): Promise<CallToolResult> {
    const { name, arguments: args } = params;
    
    if (!name) {
      throw new Error('Tool name is required');
    }
    
    const tool = this.tools.get(name);
    
    if (!tool) {
      throw new Error(`Tool not found: ${name}`);
    }
    
    // In a real implementation, we would execute the tool here
    // For now, we'll just return a placeholder
    
    return {
      content: [
        {
          type: 'text',
          text: `Executed tool ${name} with arguments: ${JSON.stringify(args)}`
        } as TextContent
      ]
    };
  }

  /**
   * Spawns a new Edit instance
   */
  public spawnEditInstance(sessionId: string, files: string[] = []): ChildProcess {
    if (this.editInstances.size >= this.maxEditInstances) {
      throw new Error(`Maximum number of Edit instances (${this.maxEditInstances}) reached`);
    }
    
    const args = [...files];
    console.log(`Spawning Edit instance with args: ${args.join(' ')}`);
    
    const process = spawn(this.editExecutablePath, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false
    });
    
    this.editInstances.set(sessionId, process);
    
    // Set up timeout to kill the process if it's not used
    setTimeout(() => {
      if (this.editInstances.has(sessionId)) {
        console.log(`Edit instance ${sessionId} timed out, killing...`);
        this.killEditInstance(sessionId);
      }
    }, this.instanceTimeout);
    
    // Handle process exit
    process.on('exit', (code) => {
      console.log(`Edit instance ${sessionId} exited with code ${code}`);
      this.editInstances.delete(sessionId);
    });
    
    return process;
  }

  /**
   * Kills an Edit instance
   */
  public killEditInstance(sessionId: string): void {
    const process = this.editInstances.get(sessionId);
    
    if (process) {
      process.kill();
      this.editInstances.delete(sessionId);
    }
  }
}