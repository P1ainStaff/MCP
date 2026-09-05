import { createHash } from 'node:crypto';
import type { McpAuditEvent, McpAuthContext } from '../types.mjs';

export function hashParams(params: unknown): string {
  return createHash('sha256').update(JSON.stringify(params ?? {})).digest('hex').slice(0, 32);
}

export function hashSubject(sub: string): string {
  return createHash('sha256').update(sub).digest('hex').slice(0, 16);
}

export function buildAuditEvent(
  auth: McpAuthContext,
  toolName: string,
  params: unknown,
  resultSize: number,
  truncated: boolean,
  durationMs: number,
  errorClass?: string
): McpAuditEvent {
  return {
    toolName,
    tenant: auth.tenant,
    subHash: auth.subHash,
    clientId: auth.clientId,
    paramsHash: hashParams(params),
    resultSize,
    truncated,
    errorClass,
    durationMs,
    correlationId: auth.correlationId,
  };
}
