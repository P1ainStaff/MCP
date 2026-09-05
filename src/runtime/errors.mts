import type { McpToolResult } from '../types.mjs';

export type McpErrorClass =
  | 'schema_violation'
  | 'missing_scope'
  | 'rate_limit'
  | 'not_found'
  | 'internal'
  | 'confirm_required'
  | 'forbidden';

export class McpToolError extends Error {
  constructor(
    public readonly errorClass: McpErrorClass,
    message: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'McpToolError';
  }
}

export function toolErrorResult(error: unknown, correlationId: string): McpToolResult {
  if (error instanceof McpToolError) {
    const payload: Record<string, unknown> = {
      error: error.errorClass,
      message: error.message,
      correlation_id: correlationId,
      ...error.details,
    };
    if (error.errorClass === 'rate_limit' && error.details?.retry_after_seconds != null) {
      payload.retry_after_seconds = error.details.retry_after_seconds;
    }
    return {
      isError: true,
      content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
      structuredContent: payload,
    };
  }

  const payload = {
    error: 'internal' as const,
    message: 'An unexpected error occurred. Please retry or contact support with the correlation id.',
    correlation_id: correlationId,
  };
  return {
    isError: true,
    content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload,
  };
}

/** JSON-RPC protocol errors (initialize, unknown method, etc.). */
export function jsonRpcError(code: number, message: string, id: string | number | null, data?: unknown): object {
  return {
    jsonrpc: '2.0',
    id,
    error: { code, message, ...(data !== undefined ? { data } : {}) },
  };
}
