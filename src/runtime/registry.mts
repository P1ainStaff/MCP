import { createHash, randomUUID } from 'node:crypto';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { buildAuditEvent } from './audit.mjs';
import { McpToolError, jsonRpcError, toolErrorResult } from './errors.mjs';
import { applyResponseBudget, toToolContent } from './limits.mjs';
import type {
  McpAuthContext,
  McpDomainBridge,
  McpExecutionContext,
  McpScope,
  McpToolResult,
  PromptDefinition,
  ResourceDefinition,
  ToolDefinition,
} from '../types.mjs';
import { MCP_PROTOCOL_VERSION, MCP_SERVER_NAME, MCP_SERVER_VERSION } from '../types.mjs';

export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();
  private prompts = new Map<string, PromptDefinition>();
  private resources = new Map<string, ResourceDefinition>();

  registerTool(tool: ToolDefinition): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Duplicate tool registration: ${tool.name}`);
    }
    this.tools.set(tool.name, tool);
  }

  registerPrompt(prompt: PromptDefinition): void {
    this.prompts.set(prompt.name, prompt);
  }

  registerResource(resource: ResourceDefinition): void {
    this.resources.set(resource.uri, resource);
  }

  listTools(scopes: McpScope[], lang: 'de' | 'en' = 'en'): object[] {
    return [...this.tools.values()]
      .filter((t) => scopes.includes(t.scope))
      .map((t) => {
        const schema = zodToJsonSchema(t.inputSchema, { $refStrategy: 'none' }) as Record<string, unknown>;
        let description = t.description[lang] || t.description.en;
        if (t.deprecatedSince) {
          description = `[deprecated since ${t.deprecatedSince}] ${description}`;
        }
        return {
          name: t.name,
          description,
          inputSchema: schema,
          annotations: t.annotations,
        };
      });
  }

  getTool(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  allTools(): ToolDefinition[] {
    return [...this.tools.values()];
  }

  listPrompts(lang: 'de' | 'en' = 'en'): object[] {
    return [...this.prompts.values()].map((p) => ({
      name: p.name,
      description: p.description[lang] || p.description.en,
      arguments: p.arguments,
    }));
  }

  getPrompt(name: string): PromptDefinition | undefined {
    return this.prompts.get(name);
  }

  listResources(lang: 'de' | 'en' = 'en'): object[] {
    return [...this.resources.values()].map((r) => ({
      uri: r.uri,
      name: r.name,
      description: r.description[lang] || r.description.en,
      mimeType: r.mimeType,
    }));
  }

  getResource(uri: string): ResourceDefinition | undefined {
    return this.resources.get(uri);
  }

  async callTool(
    name: string,
    rawArgs: unknown,
    ctx: McpExecutionContext
  ): Promise<McpToolResult> {
    const started = Date.now();
    const tool = this.tools.get(name);
    if (!tool) {
      return toolErrorResult(
        new McpToolError('not_found', `Unknown tool: ${name}`),
        ctx.auth.correlationId
      );
    }

    if (!ctx.auth.scopes.includes(tool.scope)) {
      const err = new McpToolError(
        'missing_scope',
        `Missing OAuth scope "${tool.scope}" for tool ${name}. Re-authorize the connector and grant this scope.`,
        { required_scope: tool.scope, how: 'Open the PlainStaff consent screen and enable the missing scope.' }
      );
      await this.safeAudit(ctx, tool.name, rawArgs, 0, false, started, err.errorClass);
      return toolErrorResult(err, ctx.auth.correlationId);
    }

    const parsed = tool.inputSchema.safeParse(rawArgs ?? {});
    if (!parsed.success) {
      const fields = parsed.error.issues.map((i) => ({
        path: i.path.join('.'),
        message: i.message,
      }));
      const err = new McpToolError('schema_violation', 'Input validation failed', { fields });
      await this.safeAudit(ctx, tool.name, rawArgs, 0, false, started, err.errorClass);
      return toolErrorResult(err, ctx.auth.correlationId);
    }

    try {
      const rawResult = await tool.handler(parsed.data as Record<string, unknown>, ctx);
      const payload =
        rawResult && typeof rawResult === 'object' && 'content' in (rawResult as object)
          ? (rawResult as McpToolResult)
          : toToolContent(rawResult);

      const text = payload.content?.[0]?.text ?? JSON.stringify(payload.structuredContent ?? {});
      const budget = applyResponseBudget(
        payload.structuredContent ?? (text.startsWith('{') ? JSON.parse(text) : { text })
      );
      const finalResult: McpToolResult = {
        ...payload,
        content: [{ type: 'text', text: budget.text }],
        structuredContent: budget.payload as Record<string, unknown>,
      };
      await this.safeAudit(
        ctx,
        tool.name,
        parsed.data,
        budget.text.length,
        budget.truncated,
        started,
        finalResult.isError ? 'tool_error' : undefined
      );
      return finalResult;
    } catch (error) {
      const result = toolErrorResult(error, ctx.auth.correlationId);
      const errorClass =
        error instanceof McpToolError ? error.errorClass : 'internal';
      await this.safeAudit(ctx, tool.name, parsed.data, 0, false, started, errorClass);
      return result;
    }
  }

  private async safeAudit(
    ctx: McpExecutionContext,
    toolName: string,
    params: unknown,
    resultSize: number,
    truncated: boolean,
    started: number,
    errorClass?: string
  ): Promise<void> {
    try {
      await ctx.bridge.audit(
        buildAuditEvent(ctx.auth, toolName, params, resultSize, truncated, Date.now() - started, errorClass)
      );
    } catch {
      // never fail the tool call because of audit
    }
  }
}

export function createEmptyRegistry(): ToolRegistry {
  return new ToolRegistry();
}

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

/**
 * Handle a single MCP JSON-RPC message (stateless Streamable HTTP / stdio proxy).
 * Returns `null` for notifications, which JSON-RPC forbids answering.
 */
export async function handleMcpJsonRpc(
  registry: ToolRegistry,
  message: JsonRpcRequest,
  auth: McpAuthContext,
  bridge: McpDomainBridge,
  options?: { lang?: 'de' | 'en'; clientName?: string; clientVersion?: string }
): Promise<object | null> {
  const id = message.id ?? null;
  const lang = options?.lang ?? 'en';
  const ctx: McpExecutionContext = {
    auth,
    bridge,
    lang,
    clientName: options?.clientName,
    clientVersion: options?.clientVersion,
  };

  // A JSON-RPC notification has no `id` and must never receive a response.
  if (message.method?.startsWith('notifications/') || message.id === undefined) {
    return null;
  }

  switch (message.method) {
    case 'initialize': {
      const params = message.params ?? {};
      const clientInfo = (params.clientInfo ?? {}) as { name?: string; version?: string };
      return {
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: {
            tools: { listChanged: false },
            prompts: { listChanged: false },
            resources: { subscribe: false, listChanged: false },
          },
          serverInfo: {
            name: MCP_SERVER_NAME,
            version: MCP_SERVER_VERSION,
          },
          _meta: {
            client: clientInfo.name,
          },
        },
      };
    }
    case 'ping':
      return { jsonrpc: '2.0', id, result: {} };
    case 'tools/list':
      return {
        jsonrpc: '2.0',
        id,
        result: { tools: registry.listTools(auth.scopes, lang) },
      };
    case 'tools/call': {
      const params = message.params ?? {};
      const name = String(params.name ?? '');
      const args = (params.arguments ?? {}) as Record<string, unknown>;
      const toolResult = await registry.callTool(name, args, ctx);
      return {
        jsonrpc: '2.0',
        id,
        result: toolResult,
      };
    }
    case 'prompts/list':
      return {
        jsonrpc: '2.0',
        id,
        result: { prompts: registry.listPrompts(lang) },
      };
    case 'prompts/get': {
      const name = String(message.params?.name ?? '');
      const prompt = registry.getPrompt(name);
      if (!prompt) {
        return jsonRpcError(-32602, `Unknown prompt: ${name}`, id);
      }
      const args = (message.params?.arguments ?? {}) as Record<string, string>;
      return {
        jsonrpc: '2.0',
        id,
        result: {
          description: prompt.description[lang] || prompt.description.en,
          ...prompt.build(args),
        },
      };
    }
    case 'resources/list':
      return {
        jsonrpc: '2.0',
        id,
        result: { resources: registry.listResources(lang) },
      };
    case 'resources/read': {
      const uri = String(message.params?.uri ?? '');
      const resource = registry.getResource(uri);
      if (!resource) {
        return jsonRpcError(-32602, `Unknown resource: ${uri}`, id);
      }
      const text = await resource.read(ctx);
      return {
        jsonrpc: '2.0',
        id,
        result: {
          contents: [{ uri, mimeType: resource.mimeType, text }],
        },
      };
    }
    default:
      return jsonRpcError(-32601, `Method not found: ${message.method}`, id);
  }
}

export function newCorrelationId(): string {
  return randomUUID();
}

export function sha256Short(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}
