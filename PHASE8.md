# PlainStaff MCP — Phase 8 (optional)

Optional follow-ups after the core MCP server (P0–P7) is live.

## 1. Connector directories

| Platform | Action | Status |
|----------|--------|--------|
| Claude Connector Directory | Submit `https://api.plainstaff.com/mcp` with privacy policy, tool annotations, Team/Enterprise org | Ready for submission — see `plugins/claude-code/README.md` |
| ChatGPT | Developer Mode is sufficient; Apps SDK widgets below | — |
| Grok | Custom connector on paid tiers | Documented in `plugins/grok/README.md` |

## 2. MCP Apps / Widgets (stub)

Widgets are **out of scope for production** until ChatGPT Apps SDK GA criteria are met.
Proposed first widgets (not implemented):

- **Saldo card** — renders `plainstaff.time_get_balance` as a compact balance widget
- **Projekt-Ampel** — renders `plainstaff.project_get_balance` utilization (green/amber/red)

Placeholder package path for a future implementation: `packages/MCP/src/widgets/` (intentionally empty).

## 3. Full-text search index

Current `search` uses MemoryCache substring match on master data only (AD-7).
When truncation/miss rates justify it:

1. Introduce Azure AI Search (or equivalent) over employees/projects/customers
2. Keep booking search out of generic `search` — continue using filtered domain tools
3. Estimated effort: 8–12 PT + ongoing cost

Until then, do **not** expand `search` to free-text notes.

## 4. Acceptance extras

- Load test (k6/Artillery): 50 parallel tool calls, verify rate-limit across instances
- Manual onboarding checklist with screenshots per assistant (Claude / ChatGPT / Grok)
