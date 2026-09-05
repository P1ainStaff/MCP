import { allToolDefinitions } from './tools/index.mjs';
import { mcpPrompts } from './prompts/index.mjs';
import { mcpResources } from './resources/index.mjs';
import { ToolRegistry, createEmptyRegistry, handleMcpJsonRpc, newCorrelationId, sha256Short } from './runtime/registry.mjs';
import { MCP_SCOPES, MCP_PROTOCOL_VERSION, MCP_SERVER_NAME, MCP_SERVER_VERSION } from './types.mjs';

export * from './types.mjs';
export * from './runtime/errors.mjs';
export * from './runtime/limits.mjs';
export * from './runtime/audit.mjs';
export * from './runtime/registry.mjs';
export * from './schemas/index.mjs';
export { allToolDefinitions } from './tools/index.mjs';
export { mcpPrompts } from './prompts/index.mjs';
export { mcpResources } from './resources/index.mjs';

/** Fully populated registry with all curated tools, prompts, and resources. */
export function createPlainStaffRegistry(): ToolRegistry {
  const registry = createEmptyRegistry();
  for (const tool of allToolDefinitions) {
    registry.registerTool(tool);
  }
  for (const prompt of mcpPrompts) {
    registry.registerPrompt(prompt);
  }
  for (const resource of mcpResources) {
    registry.registerResource(resource);
  }
  return registry;
}

export const DEFAULT_SCOPES = [...MCP_SCOPES];

export { handleMcpJsonRpc, newCorrelationId, sha256Short, MCP_PROTOCOL_VERSION, MCP_SERVER_NAME, MCP_SERVER_VERSION };
