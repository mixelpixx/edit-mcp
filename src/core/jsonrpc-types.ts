/**
 * Type definitions for jsonrpc-lite library
 */

export interface JsonRpcError {
  code: number;
  message: string;
  data?: any;
}

export interface JsonRpcObject {
  jsonrpc: string;
}

export interface RequestObject extends JsonRpcObject {
  id: string | number;
  method: string;
  params?: any;
}

export interface NotificationObject extends JsonRpcObject {
  method: string;
  params?: any;
}

export interface SuccessObject extends JsonRpcObject {
  id: string | number;
  result: any;
}

export interface ErrorObject extends JsonRpcObject {
  id: string | number | null;
  error: JsonRpcError;
}

export type JsonRpcType = 'request' | 'notification' | 'success' | 'error' | 'invalid';

export interface ParsedObject {
  type: JsonRpcType;
  payload: JsonRpcObject;
}

export type JsonRpc = ParsedObject;

// Type alias for any JSON-RPC message
export type JsonRpcMessage = RequestObject | NotificationObject | SuccessObject | ErrorObject;