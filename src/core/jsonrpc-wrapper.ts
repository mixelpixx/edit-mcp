/**
 * Wrapper for jsonrpc-lite library to handle type issues
 */
import jsonrpc from 'jsonrpc-lite';
import { RequestId } from './mcp-types';

/**
 * Creates a JSON-RPC success response
 */
export function createSuccessResponse(id: RequestId, result: any): any {
  return jsonrpc.success(id, result);
}

/**
 * Creates a JSON-RPC error response
 */
export function createErrorResponse(id: RequestId | null, message: string, code: number, data?: any): any {
  return jsonrpc.error(id, new jsonrpc.JsonRpcError(message, code, data));
}

/**
 * Creates a JSON-RPC notification
 */
export function createNotification(method: string, params?: any): any {
  return jsonrpc.notification(method, params);
}

/**
 * Creates a JSON-RPC request
 */
export function createRequest(id: RequestId, method: string, params?: any): any {
  return jsonrpc.request(id, method, params);
}

/**
 * Parses a JSON-RPC message
 */
export function parseJsonRpc(message: string): any {
  return jsonrpc.parse(message);
}

/**
 * Checks if a parsed object is a request
 */
export function isRequest(parsed: any): boolean {
  return parsed.type === 'request';
}

/**
 * Checks if a parsed object is a notification
 */
export function isNotification(parsed: any): boolean {
  return parsed.type === 'notification';
}

/**
 * Gets the payload from a parsed object
 */
export function getPayload(parsed: any): any {
  return parsed.payload;
}

/**
 * Parses a JSON-RPC message from an object (for HTTP requests)
 */
export function parseMessage(obj: any): any {
  // If it's already a parsed object, return it
  if (typeof obj === 'object' && obj !== null) {
    return obj;
  }
  // Otherwise try to parse it as JSON string
  return parseJsonRpc(JSON.stringify(obj));
}

/**
 * Creates a JSON-RPC error response (alias for createErrorResponse)
 */
export function createError(id: RequestId | null, code: number, message: string, data?: any): any {
  return createErrorResponse(id, message, code, data);
}

/**
 * Creates a JSON-RPC success response (alias for createSuccessResponse)
 */
export function createSuccess(id: RequestId, result: any): any {
  return createSuccessResponse(id, result);
}