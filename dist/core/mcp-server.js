"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MCPServer = void 0;
const child_process_1 = require("child_process");
const fs = __importStar(require("fs"));
const chalk_1 = __importDefault(require("chalk"));
const mcp_types_1 = require("./mcp-types");
const jsonrpc_wrapper_1 = require("./jsonrpc-wrapper");
class MCPServer {
    constructor(options) {
        this.initialized = false;
        this.requestHandlers = new Map();
        this.notificationHandlers = new Map();
        this.tools = new Map();
        this.resources = new Map();
        this.editInstances = new Map();
        this.nextRequestId = 1;
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
    findEditExecutable() {
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
            const which = require('child_process').execSync(isWindows ? 'where edit' : 'which edit', { encoding: 'utf8' }).trim();
            if (which && fs.existsSync(which)) {
                return which;
            }
        }
        catch (error) {
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
    registerRequestHandler(method, handler) {
        this.requestHandlers.set(method, handler);
    }
    /**
     * Registers a notification handler for a specific method
     */
    registerNotificationHandler(method, handler) {
        this.notificationHandlers.set(method, handler);
    }
    /**
     * Registers a tool that can be called by clients
     */
    registerTool(tool) {
        this.tools.set(tool.name, tool);
    }
    /**
     * Registers a resource that can be accessed by clients
     */
    registerResource(resource) {
        this.resources.set(resource.uri, resource);
    }
    /**
     * Handles an incoming JSON-RPC message
     */
    async handleMessage(message) {
        try {
            const parsed = (0, jsonrpc_wrapper_1.parseJsonRpc)(message);
            if (Array.isArray(parsed)) {
                // Handle batch requests
                const responses = await Promise.all(parsed.map(item => this.processMessage(item)));
                // Filter out null responses (notifications)
                const validResponses = responses.filter(r => r !== null);
                if (validResponses.length === 0) {
                    return null;
                }
                return JSON.stringify(validResponses);
            }
            else {
                // Handle single request
                const response = await this.processMessage(parsed);
                if (response === null) {
                    return null;
                }
                return JSON.stringify(response);
            }
        }
        catch (error) {
            console.error('Error parsing JSON-RPC message:', error);
            // Return a parse error
            const errorResponse = (0, jsonrpc_wrapper_1.createErrorResponse)(null, 'Parse error', -32700);
            return JSON.stringify(errorResponse);
        }
    }
    /**
     * Processes a single parsed JSON-RPC message
     */
    async processMessage(parsed) {
        if ((0, jsonrpc_wrapper_1.isRequest)(parsed)) {
            return await this.handleRequest((0, jsonrpc_wrapper_1.getPayload)(parsed));
        }
        else if ((0, jsonrpc_wrapper_1.isNotification)(parsed)) {
            await this.handleNotification((0, jsonrpc_wrapper_1.getPayload)(parsed));
            return null;
        }
        else {
            console.warn('Received an unexpected message type:', parsed.type);
            return null;
        }
    }
    /**
     * Handles a JSON-RPC request
     */
    async handleRequest(request) {
        console.log(chalk_1.default.blue(`Received request: ${request.method}`));
        // Special case for initialize request
        if (request.method === 'initialize' && this.initialized) {
            return (0, jsonrpc_wrapper_1.createErrorResponse)(request.id, 'Server is already initialized', mcp_types_1.INVALID_PARAMS);
        }
        // For all other requests, ensure the server is initialized
        if (request.method !== 'initialize' && !this.initialized) {
            return (0, jsonrpc_wrapper_1.createErrorResponse)(request.id, 'Server is not initialized', mcp_types_1.INVALID_PARAMS);
        }
        const handler = this.requestHandlers.get(request.method);
        if (!handler) {
            return (0, jsonrpc_wrapper_1.createErrorResponse)(request.id, `Method not found: ${request.method}`, mcp_types_1.METHOD_NOT_FOUND);
        }
        try {
            const result = await handler(request.params || {});
            return (0, jsonrpc_wrapper_1.createSuccessResponse)(request.id, result);
        }
        catch (error) {
            console.error(`Error handling request ${request.method}:`, error);
            return (0, jsonrpc_wrapper_1.createErrorResponse)(request.id, error.message || 'Internal error', error.code || mcp_types_1.INTERNAL_ERROR, error.data);
        }
    }
    /**
     * Handles a JSON-RPC notification
     */
    async handleNotification(notification) {
        console.log(chalk_1.default.green(`Received notification: ${notification.method}`));
        const handler = this.notificationHandlers.get(notification.method);
        if (!handler) {
            console.warn(`No handler registered for notification: ${notification.method}`);
            return;
        }
        try {
            await handler(notification.params || {});
        }
        catch (error) {
            console.error(`Error handling notification ${notification.method}:`, error);
        }
    }
    /**
     * Creates a JSON-RPC notification
     */
    createNotification(method, params) {
        const notification = (0, jsonrpc_wrapper_1.createNotification)(method, params);
        return JSON.stringify(notification);
    }
    /**
     * Creates a JSON-RPC request
     */
    createRequest(method, params) {
        const id = this.nextRequestId++;
        const request = (0, jsonrpc_wrapper_1.createRequest)(id, method, params);
        return { id, message: JSON.stringify(request) };
    }
    /**
     * Handles the initialize request
     */
    async handleInitialize(params) {
        console.log(chalk_1.default.yellow('Initializing server...'));
        console.log(`Client protocol version: ${params.protocolVersion}`);
        console.log(`Client info: ${params.clientInfo.name} ${params.clientInfo.version}`);
        return {
            protocolVersion: mcp_types_1.LATEST_PROTOCOL_VERSION,
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
    handleInitialized(params) {
        console.log(chalk_1.default.yellow('Server initialized'));
        this.initialized = true;
    }
    /**
     * Handles the ping request
     */
    async handlePing() {
        return {};
    }
    /**
     * Handles the resources/list request
     */
    async handleResourcesList(params) {
        // In a real implementation, we would handle pagination here
        return {
            resources: Array.from(this.resources.values())
        };
    }
    /**
     * Handles the resources/read request
     */
    async handleResourcesRead(params) {
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
                }
            ]
        };
    }
    /**
     * Handles the tools/list request
     */
    async handleToolsList(params) {
        // In a real implementation, we would handle pagination here
        return {
            tools: Array.from(this.tools.values())
        };
    }
    /**
     * Handles the tools/call request
     */
    async handleToolsCall(params) {
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
                }
            ]
        };
    }
    /**
     * Spawns a new Edit instance
     */
    spawnEditInstance(sessionId, files = []) {
        if (this.editInstances.size >= this.maxEditInstances) {
            throw new Error(`Maximum number of Edit instances (${this.maxEditInstances}) reached`);
        }
        const args = [...files];
        console.log(`Spawning Edit instance with args: ${args.join(' ')}`);
        const process = (0, child_process_1.spawn)(this.editExecutablePath, args, {
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
    killEditInstance(sessionId) {
        const process = this.editInstances.get(sessionId);
        if (process) {
            process.kill();
            this.editInstances.delete(sessionId);
        }
    }
}
exports.MCPServer = MCPServer;
//# sourceMappingURL=mcp-server.js.map