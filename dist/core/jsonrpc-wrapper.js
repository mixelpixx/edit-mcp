"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSuccessResponse = createSuccessResponse;
exports.createErrorResponse = createErrorResponse;
exports.createNotification = createNotification;
exports.createRequest = createRequest;
exports.parseJsonRpc = parseJsonRpc;
exports.isRequest = isRequest;
exports.isNotification = isNotification;
exports.getPayload = getPayload;
exports.parseMessage = parseMessage;
exports.createError = createError;
exports.createSuccess = createSuccess;
/**
 * Wrapper for jsonrpc-lite library to handle type issues
 */
const jsonrpc_lite_1 = __importDefault(require("jsonrpc-lite"));
/**
 * Creates a JSON-RPC success response
 */
function createSuccessResponse(id, result) {
    return jsonrpc_lite_1.default.success(id, result);
}
/**
 * Creates a JSON-RPC error response
 */
function createErrorResponse(id, message, code, data) {
    return jsonrpc_lite_1.default.error(id, new jsonrpc_lite_1.default.JsonRpcError(message, code, data));
}
/**
 * Creates a JSON-RPC notification
 */
function createNotification(method, params) {
    return jsonrpc_lite_1.default.notification(method, params);
}
/**
 * Creates a JSON-RPC request
 */
function createRequest(id, method, params) {
    return jsonrpc_lite_1.default.request(id, method, params);
}
/**
 * Parses a JSON-RPC message
 */
function parseJsonRpc(message) {
    return jsonrpc_lite_1.default.parse(message);
}
/**
 * Checks if a parsed object is a request
 */
function isRequest(parsed) {
    return parsed.type === 'request';
}
/**
 * Checks if a parsed object is a notification
 */
function isNotification(parsed) {
    return parsed.type === 'notification';
}
/**
 * Gets the payload from a parsed object
 */
function getPayload(parsed) {
    return parsed.payload;
}
/**
 * Parses a JSON-RPC message from an object (for HTTP requests)
 */
function parseMessage(obj) {
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
function createError(id, code, message, data) {
    return createErrorResponse(id, message, code, data);
}
/**
 * Creates a JSON-RPC success response (alias for createSuccessResponse)
 */
function createSuccess(id, result) {
    return createSuccessResponse(id, result);
}
//# sourceMappingURL=jsonrpc-wrapper.js.map