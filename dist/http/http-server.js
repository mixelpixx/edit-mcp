"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HttpServer = void 0;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const body_parser_1 = __importDefault(require("body-parser"));
const helmet_1 = __importDefault(require("helmet"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const morgan_1 = __importDefault(require("morgan"));
const jsonrpc_wrapper_1 = require("../core/jsonrpc-wrapper");
class HttpServer {
    constructor(mcpServer, config) {
        this.mcpServer = mcpServer;
        this.config = {
            corsOrigins: ['*'],
            rateLimitWindowMs: 15 * 60 * 1000, // 15 minutes
            rateLimitMax: 100, // limit each IP to 100 requests per windowMs
            authEnabled: false,
            ...config
        };
        this.app = (0, express_1.default)();
        this.setupMiddleware();
        this.setupRoutes();
    }
    setupMiddleware() {
        // Security middleware
        this.app.use((0, helmet_1.default)());
        // CORS configuration
        this.app.use((0, cors_1.default)({
            origin: this.config.corsOrigins,
            credentials: true
        }));
        // Body parsing
        this.app.use(body_parser_1.default.json({ limit: '10mb' }));
        this.app.use(body_parser_1.default.urlencoded({ extended: true }));
        // Logging
        this.app.use((0, morgan_1.default)('combined'));
        // Rate limiting
        const limiter = (0, express_rate_limit_1.default)({
            windowMs: this.config.rateLimitWindowMs,
            max: this.config.rateLimitMax,
            message: 'Too many requests from this IP, please try again later.'
        });
        this.app.use('/api/', limiter);
        // Authentication middleware (if enabled)
        if (this.config.authEnabled) {
            this.app.use('/api/', this.authMiddleware.bind(this));
        }
    }
    authMiddleware(req, res, next) {
        const apiKey = req.headers['x-api-key'] || req.query.apiKey;
        if (!apiKey || apiKey !== this.config.apiKey) {
            res.status(401).json({
                error: 'Unauthorized',
                message: 'Invalid or missing API key'
            });
            return;
        }
        next();
    }
    setupRoutes() {
        // Health check
        this.app.get('/health', (req, res) => {
            res.json({ status: 'ok', timestamp: new Date().toISOString() });
        });
        // JSON-RPC endpoint
        this.app.post('/jsonrpc', async (req, res) => {
            try {
                const message = (0, jsonrpc_wrapper_1.parseMessage)(req.body);
                const response = await this.mcpServer.handleMessage(message);
                res.json(response);
            }
            catch (error) {
                const errorResponse = (0, jsonrpc_wrapper_1.createError)(req.body.id || null, -32603, error.message || 'Internal error');
                res.status(500).json(errorResponse);
            }
        });
        // REST API endpoints
        this.setupRestEndpoints();
        // API documentation
        this.app.get('/api/docs', (req, res) => {
            res.json(this.getApiDocumentation());
        });
        // 404 handler
        this.app.use((req, res) => {
            res.status(404).json({
                error: 'Not Found',
                message: `Route ${req.method} ${req.path} not found`
            });
        });
        // Error handler
        this.app.use((err, req, res, next) => {
            console.error('Error:', err);
            res.status(500).json({
                error: 'Internal Server Error',
                message: err.message
            });
        });
    }
    setupRestEndpoints() {
        // List available tools
        this.app.get('/api/tools', async (req, res) => {
            try {
                const listRequest = (0, jsonrpc_wrapper_1.parseMessage)({
                    jsonrpc: '2.0',
                    method: 'tools/list',
                    id: 'rest-' + Date.now()
                });
                const response = await this.mcpServer.handleMessage(listRequest);
                res.json(response);
            }
            catch (error) {
                res.status(500).json({ error: error.message });
            }
        });
        // Call a tool
        this.app.post('/api/tools/:toolName', async (req, res) => {
            try {
                const { toolName } = req.params;
                const toolRequest = (0, jsonrpc_wrapper_1.parseMessage)({
                    jsonrpc: '2.0',
                    method: 'tools/call',
                    params: {
                        name: toolName,
                        arguments: req.body
                    },
                    id: 'rest-' + Date.now()
                });
                const response = await this.mcpServer.handleMessage(toolRequest);
                res.json(response);
            }
            catch (error) {
                res.status(500).json({ error: error.message });
            }
        });
        // File operations REST endpoints
        this.app.get('/api/files/:path(*)', async (req, res) => {
            try {
                const readRequest = (0, jsonrpc_wrapper_1.parseMessage)({
                    jsonrpc: '2.0',
                    method: 'tools/call',
                    params: {
                        name: 'read_file',
                        arguments: {
                            path: req.params.path,
                            encoding: req.query.encoding || 'utf8'
                        }
                    },
                    id: 'rest-' + Date.now()
                });
                const response = await this.mcpServer.handleMessage(readRequest);
                res.json(response);
            }
            catch (error) {
                res.status(500).json({ error: error.message });
            }
        });
        this.app.put('/api/files/:path(*)', async (req, res) => {
            try {
                const writeRequest = (0, jsonrpc_wrapper_1.parseMessage)({
                    jsonrpc: '2.0',
                    method: 'tools/call',
                    params: {
                        name: 'write_file',
                        arguments: {
                            path: req.params.path,
                            content: req.body.content,
                            encoding: req.body.encoding || 'utf8'
                        }
                    },
                    id: 'rest-' + Date.now()
                });
                const response = await this.mcpServer.handleMessage(writeRequest);
                res.json(response);
            }
            catch (error) {
                res.status(500).json({ error: error.message });
            }
        });
        this.app.get('/api/list/:directory(*)', async (req, res) => {
            try {
                const listRequest = (0, jsonrpc_wrapper_1.parseMessage)({
                    jsonrpc: '2.0',
                    method: 'tools/call',
                    params: {
                        name: 'list_files',
                        arguments: {
                            directory: req.params.directory || '.',
                            pattern: req.query.pattern
                        }
                    },
                    id: 'rest-' + Date.now()
                });
                const response = await this.mcpServer.handleMessage(listRequest);
                res.json(response);
            }
            catch (error) {
                res.status(500).json({ error: error.message });
            }
        });
        // Search endpoint
        this.app.post('/api/search', async (req, res) => {
            try {
                const searchRequest = (0, jsonrpc_wrapper_1.parseMessage)({
                    jsonrpc: '2.0',
                    method: 'tools/call',
                    params: {
                        name: 'find_in_file',
                        arguments: {
                            path: req.body.path,
                            pattern: req.body.pattern,
                            contextLines: req.body.contextLines || 2
                        }
                    },
                    id: 'rest-' + Date.now()
                });
                const response = await this.mcpServer.handleMessage(searchRequest);
                res.json(response);
            }
            catch (error) {
                res.status(500).json({ error: error.message });
            }
        });
        // Format code endpoint
        this.app.post('/api/format', async (req, res) => {
            try {
                const formatRequest = (0, jsonrpc_wrapper_1.parseMessage)({
                    jsonrpc: '2.0',
                    method: 'tools/call',
                    params: {
                        name: 'format_code',
                        arguments: {
                            path: req.body.path,
                            language: req.body.language
                        }
                    },
                    id: 'rest-' + Date.now()
                });
                const response = await this.mcpServer.handleMessage(formatRequest);
                res.json(response);
            }
            catch (error) {
                res.status(500).json({ error: error.message });
            }
        });
        // Refactor endpoint
        this.app.post('/api/refactor', async (req, res) => {
            try {
                const refactorRequest = (0, jsonrpc_wrapper_1.parseMessage)({
                    jsonrpc: '2.0',
                    method: 'tools/call',
                    params: {
                        name: 'smart_refactor',
                        arguments: {
                            files: req.body.files,
                            oldName: req.body.oldName,
                            newName: req.body.newName
                        }
                    },
                    id: 'rest-' + Date.now()
                });
                const response = await this.mcpServer.handleMessage(refactorRequest);
                res.json(response);
            }
            catch (error) {
                res.status(500).json({ error: error.message });
            }
        });
    }
    getApiDocumentation() {
        return {
            version: '1.0.0',
            endpoints: {
                health: {
                    method: 'GET',
                    path: '/health',
                    description: 'Health check endpoint'
                },
                jsonrpc: {
                    method: 'POST',
                    path: '/jsonrpc',
                    description: 'JSON-RPC 2.0 endpoint',
                    body: {
                        jsonrpc: '2.0',
                        method: 'string',
                        params: 'object',
                        id: 'string | number'
                    }
                },
                tools: {
                    list: {
                        method: 'GET',
                        path: '/api/tools',
                        description: 'List all available tools'
                    },
                    call: {
                        method: 'POST',
                        path: '/api/tools/:toolName',
                        description: 'Call a specific tool',
                        params: {
                            toolName: 'string'
                        },
                        body: 'Tool-specific arguments'
                    }
                },
                files: {
                    read: {
                        method: 'GET',
                        path: '/api/files/:path',
                        description: 'Read file content',
                        params: {
                            path: 'string'
                        },
                        query: {
                            encoding: 'string (optional)'
                        }
                    },
                    write: {
                        method: 'PUT',
                        path: '/api/files/:path',
                        description: 'Write file content',
                        params: {
                            path: 'string'
                        },
                        body: {
                            content: 'string',
                            encoding: 'string (optional)'
                        }
                    },
                    list: {
                        method: 'GET',
                        path: '/api/list/:directory',
                        description: 'List files in directory',
                        params: {
                            directory: 'string'
                        },
                        query: {
                            pattern: 'string (optional)'
                        }
                    }
                },
                search: {
                    method: 'POST',
                    path: '/api/search',
                    description: 'Search for pattern in file',
                    body: {
                        path: 'string',
                        pattern: 'string',
                        contextLines: 'number (optional)'
                    }
                },
                format: {
                    method: 'POST',
                    path: '/api/format',
                    description: 'Format code in file',
                    body: {
                        path: 'string',
                        language: 'string (optional)'
                    }
                },
                refactor: {
                    method: 'POST',
                    path: '/api/refactor',
                    description: 'Refactor symbol across files',
                    body: {
                        files: 'string[]',
                        oldName: 'string',
                        newName: 'string'
                    }
                }
            },
            authentication: this.config.authEnabled ? {
                type: 'API Key',
                header: 'X-API-Key',
                description: 'Include API key in X-API-Key header or apiKey query parameter'
            } : null
        };
    }
    start() {
        return new Promise((resolve) => {
            this.app.listen(this.config.port, () => {
                console.log(`HTTP server listening on port ${this.config.port}`);
                console.log(`API documentation available at http://localhost:${this.config.port}/api/docs`);
                resolve();
            });
        });
    }
}
exports.HttpServer = HttpServer;
//# sourceMappingURL=http-server.js.map