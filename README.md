# @plainstaff/mcp

> [!WARNING]
> **Under Active Development — Not Yet Live**  
> The PlainStaff MCP extension is currently in active development and **cannot be used yet**. The remote endpoints and packages are not yet live.

Model Context Protocol server for PlainStaff — curated tools, OAuth-scoped registry, and stdio proxy.

## Packages

| Export | Role |
|--------|------|
| `@plainstaff/mcp` | Tool registry, Zod schemas, prompts, resources, JSON-RPC handler |
| `plainstaff-mcp-server` (bin) | stdio → `https://api.plainstaff.com/mcp` proxy |

## Quick start (local stdio)

```bash
export PLAINSTAFF_ACCESS_TOKEN="<oauth-access-token>"
# or: export PLAINSTAFF_API_KEY="<user-api-key>"
npx -y -p @plainstaff/mcp plainstaff-mcp-server
```

## Remote endpoint

`POST https://api.plainstaff.com/mcp` — Streamable HTTP, JSON-only. OAuth 2.1 via:

- `GET /.well-known/oauth-protected-resource`
- `GET /.well-known/oauth-authorization-server`

## Develop

```bash
pnpm --filter @plainstaff/mcp build
pnpm --filter @plainstaff/mcp test
```

See `mcp-server-plan.md` (repo root) and `PHASE8.md` for roadmap / optional extras.
