import type { z } from 'zod';

/** OAuth scopes used by the MCP authorization server and tool registry. */
export const MCP_SCOPES = [
  'time:read',
  'time:write',
  'projects:read',
  'projects:write',
  'employees:read',
  'reports:read',
  'approvals:write',
] as const;

export type McpScope = (typeof MCP_SCOPES)[number];

/** Identity derived exclusively from the OAuth access token (never from tool input). */
export interface McpAuthContext {
  tenant: string;
  sub: string;
  region: string;
  roles: number;
  scopes: McpScope[];
  clientId: string;
  audience: string;
  correlationId: string;
  /** Hashed subject for telemetry (never log raw PII). */
  subHash: string;
}

export interface McpPagingInput {
  cursor?: string;
  limit?: number;
}

export interface McpPageResult<T> {
  items: T[];
  has_more: boolean;
  next_cursor?: string;
}

export interface McpToolAnnotations {
  readOnlyHint: boolean;
  destructiveHint: boolean;
  idempotentHint: boolean;
  openWorldHint?: boolean;
}

export interface McpToolResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
  structuredContent?: Record<string, unknown>;
}

export type McpToolHandler = (
  args: Record<string, unknown>,
  ctx: McpExecutionContext
) => Promise<McpToolResult | Record<string, unknown> | unknown>;

/**
 * Bridge from MCP tool handlers to PlainStaff domain services.
 * Implemented in apps/API — packages/MCP stays runtime-agnostic.
 */
export interface McpDomainBridge {
  timeGetBookings(args: Record<string, unknown>, auth: McpAuthContext): Promise<unknown>;
  timeGetBalance(args: Record<string, unknown>, auth: McpAuthContext): Promise<unknown>;
  timeBook(args: Record<string, unknown>, auth: McpAuthContext): Promise<unknown>;
  timeCorrectBooking(args: Record<string, unknown>, auth: McpAuthContext): Promise<unknown>;
  timeGetAbsences(args: Record<string, unknown>, auth: McpAuthContext): Promise<unknown>;
  timeRequestAbsence(args: Record<string, unknown>, auth: McpAuthContext): Promise<unknown>;
  timeGetOpenApprovals(args: Record<string, unknown>, auth: McpAuthContext): Promise<unknown>;
  timeApprove(args: Record<string, unknown>, auth: McpAuthContext): Promise<unknown>;
  projectList(args: Record<string, unknown>, auth: McpAuthContext): Promise<unknown>;
  projectGetBalance(args: Record<string, unknown>, auth: McpAuthContext): Promise<unknown>;
  projectGetBookings(args: Record<string, unknown>, auth: McpAuthContext): Promise<unknown>;
  projectBookTime(args: Record<string, unknown>, auth: McpAuthContext): Promise<unknown>;
  projectGetBillingStatus(args: Record<string, unknown>, auth: McpAuthContext): Promise<unknown>;
  employeeList(args: Record<string, unknown>, auth: McpAuthContext): Promise<unknown>;
  employeeGet(args: Record<string, unknown>, auth: McpAuthContext): Promise<unknown>;
  teamList(args: Record<string, unknown>, auth: McpAuthContext): Promise<unknown>;
  customerList(args: Record<string, unknown>, auth: McpAuthContext): Promise<unknown>;
  articleList(args: Record<string, unknown>, auth: McpAuthContext): Promise<unknown>;
  modelList(args: Record<string, unknown>, auth: McpAuthContext): Promise<unknown>;
  regionGetHolidays(args: Record<string, unknown>, auth: McpAuthContext): Promise<unknown>;
  reportListConfigurations(args: Record<string, unknown>, auth: McpAuthContext): Promise<unknown>;
  reportRun(args: Record<string, unknown>, auth: McpAuthContext): Promise<unknown>;
  shiftGetPlan(args: Record<string, unknown>, auth: McpAuthContext): Promise<unknown>;
  shiftGetAvailability(args: Record<string, unknown>, auth: McpAuthContext): Promise<unknown>;
  complianceCheckPeriod(args: Record<string, unknown>, auth: McpAuthContext): Promise<unknown>;
  searchMasterData(args: Record<string, unknown>, auth: McpAuthContext): Promise<unknown>;
  fetchMasterData(args: Record<string, unknown>, auth: McpAuthContext): Promise<unknown>;
  /** Confirm-token store for destructive writes (TTL 5 min). */
  issueConfirmToken(payload: ConfirmTokenPayload): Promise<string>;
  consumeConfirmToken(token: string, expected: ConfirmTokenPayload): Promise<boolean>;
  audit(event: McpAuditEvent): Promise<void>;
}

export interface ConfirmTokenPayload {
  tenant: string;
  sub: string;
  toolName: string;
  paramsHash: string;
}

export interface McpAuditEvent {
  toolName: string;
  tenant: string;
  subHash: string;
  clientId: string;
  paramsHash: string;
  resultSize: number;
  truncated: boolean;
  errorClass?: string;
  durationMs: number;
  correlationId: string;
}

export interface McpExecutionContext {
  auth: McpAuthContext;
  bridge: McpDomainBridge;
  lang: 'de' | 'en';
  clientName?: string;
  clientVersion?: string;
}

export interface ToolDefinition {
  name: string;
  description: { de: string; en: string };
  scope: McpScope;
  inputSchema: z.ZodType;
  annotations: McpToolAnnotations;
  handler: McpToolHandler;
  since: string;
  deprecatedSince?: string;
  /** Rate-limit bucket: read | write | report */
  rateBucket: 'read' | 'write' | 'report';
}

export interface PromptDefinition {
  name: string;
  description: { de: string; en: string };
  arguments?: Array<{ name: string; description: string; required?: boolean }>;
  build: (args: Record<string, string>) => { messages: Array<{ role: 'user' | 'assistant'; content: { type: 'text'; text: string } }> };
}

export interface ResourceDefinition {
  uri: string;
  name: string;
  description: { de: string; en: string };
  mimeType: string;
  read: (ctx: McpExecutionContext) => Promise<string>;
}

export const MCP_PROTOCOL_VERSION = '2025-06-18';
export const MCP_SERVER_NAME = 'plainstaff';
export const MCP_SERVER_VERSION = '1.0.0';
export const MCP_RESPONSE_BUDGET_CHARS = 25_000;
export const MCP_DEFAULT_PAGE_LIMIT = 50;
export const MCP_MAX_PAGE_LIMIT = 200;
export const MCP_SEARCH_MAX_IDS = 50;
export const MCP_BOOKING_MAX_DAYS = 366;
export const MCP_CONFIRM_TTL_SECONDS = 300;
