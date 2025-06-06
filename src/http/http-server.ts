import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import morgan from 'morgan';
import { MCPServer } from '../core/mcp-server';
import { parseMessage, createError, createSuccess } from '../core/jsonrpc-wrapper';
import { JsonRpcMessage, JsonRpcError } from '../core/jsonrpc-types';

export interface HttpServerConfig {
  port: number;
  corsOrigins?: string[];
  rateLimitWindowMs?: number;
  rateLimitMax?: number;
  authEnabled?: boolean;
  apiKey?: string;
}

export class HttpServer {
  private app: Application;
  private mcpServer: MCPServer;
  private config: HttpServerConfig;

  constructor(mcpServer: MCPServer, config: HttpServerConfig) {
    this.mcpServer = mcpServer;
    this.config = {
      corsOrigins: ['*'],
      rateLimitWindowMs: 15 * 60 * 1000, // 15 minutes
      rateLimitMax: 100, // limit each IP to 100 requests per windowMs
      authEnabled: false,
      ...config
    };
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    // Security middleware
    this.app.use(helmet());

    // CORS configuration
    this.app.use(cors({
      origin: this.config.corsOrigins,
      credentials: true
    }));

    // Body parsing
    this.app.use(bodyParser.json({ limit: '10mb' }));
    this.app.use(bodyParser.urlencoded({ extended: true }));

    // Logging
    this.app.use(morgan('combined'));

    // Rate limiting
    const limiter = rateLimit({
      windowMs: this.config.rateLimitWindowMs!,
      max: this.config.rateLimitMax!,
      message: 'Too many requests from this IP, please try again later.'
    });
    this.app.use('/api/', limiter);

    // Authentication middleware (if enabled)
    if (this.config.authEnabled) {
      this.app.use('/api/', this.authMiddleware.bind(this));
    }
  }

  private authMiddleware(req: Request, res: Response, next: NextFunction): void {
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

  private setupRoutes(): void {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    // JSON-RPC endpoint
    this.app.post('/jsonrpc', async (req, res) => {
      try {
        const message = parseMessage(req.body);
        const response = await this.mcpServer.handleMessage(message);
        res.json(response);
      } catch (error: any) {
        const errorResponse = createError(
          req.body.id || null,
          -32603,
          error.message || 'Internal error'
        );
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
    this.app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
      console.error('Error:', err);
      res.status(500).json({
        error: 'Internal Server Error',
        message: err.message
      });
    });
  }

  private setupRestEndpoints(): void {
    // List available tools
    this.app.get('/api/tools', async (req, res) => {
      try {
        const listRequest = parseMessage({
          jsonrpc: '2.0',
          method: 'tools/list',
          id: 'rest-' + Date.now()
        });
        const response = await this.mcpServer.handleMessage(listRequest);
        res.json(response);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // Call a tool
    this.app.post('/api/tools/:toolName', async (req, res) => {
      try {
        const { toolName } = req.params;
        const toolRequest = parseMessage({
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
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // File operations REST endpoints
    this.app.get('/api/files/:path(*)', async (req, res) => {
      try {
        const readRequest = parseMessage({
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
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.put('/api/files/:path(*)', async (req, res) => {
      try {
        const writeRequest = parseMessage({
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
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/list/:directory(*)', async (req, res) => {
      try {
        const listRequest = parseMessage({
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
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // Search endpoint
    this.app.post('/api/search', async (req, res) => {
      try {
        const searchRequest = parseMessage({
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
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // Format code endpoint
    this.app.post('/api/format', async (req, res) => {
      try {
        const formatRequest = parseMessage({
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
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // Refactor endpoint
    this.app.post('/api/refactor', async (req, res) => {
      try {
        const refactorRequest = parseMessage({
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
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });
  }

  private getApiDocumentation(): any {
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

  public start(): Promise<void> {
    return new Promise((resolve) => {
      this.app.listen(this.config.port, () => {
        console.log(`HTTP server listening on port ${this.config.port}`);
        console.log(`API documentation available at http://localhost:${this.config.port}/api/docs`);
        resolve();
      });
    });
  }
}