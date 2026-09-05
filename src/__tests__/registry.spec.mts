import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createPlainStaffRegistry,
  handleMcpJsonRpc,
  MCP_SCOPES,
  McpToolError,
  applyResponseBudget,
  encodeCursor,
  decodeCursor,
  normalizePaging,
  slicePage,
  type McpAuthContext,
  type McpDomainBridge,
} from '../index.mjs';

function auth(scopes = [...MCP_SCOPES]): McpAuthContext {
  return {
    tenant: 'demo',
    sub: 'user@example.com',
    region: 'europe',
    roles: 1,
    scopes,
    clientId: 'test-client',
    audience: 'https://api.plainstaff.com/mcp',
    correlationId: 'corr-1',
    subHash: createHash('sha256').update('user@example.com').digest('hex').slice(0, 16),
  };
}

function mockBridge(overrides: Partial<McpDomainBridge> = {}): McpDomainBridge {
  const base: McpDomainBridge = {
    timeGetBookings: vi.fn(async () => ({ items: [], has_more: false })),
    timeGetBalance: vi.fn(async () => ({ balance_minutes: 0 })),
    timeBook: vi.fn(async () => ({ ok: true })),
    timeCorrectBooking: vi.fn(async () => ({ ok: true })),
    timeGetAbsences: vi.fn(async () => ({ items: [], has_more: false })),
    timeRequestAbsence: vi.fn(async () => ({ ok: true })),
    timeGetOpenApprovals: vi.fn(async () => ({ items: [], has_more: false })),
    timeApprove: vi.fn(async () => ({ ok: true })),
    projectList: vi.fn(async () => ({ items: [], has_more: false })),
    projectGetBalance: vi.fn(async () => ({ planned: 0, actual: 0 })),
    projectGetBookings: vi.fn(async () => ({ items: [], has_more: false })),
    projectBookTime: vi.fn(async () => ({ ok: true })),
    projectGetBillingStatus: vi.fn(async () => ({ status: 'open' })),
    employeeList: vi.fn(async () => ({ items: [], has_more: false })),
    employeeGet: vi.fn(async () => ({ id: 'e1' })),
    teamList: vi.fn(async () => ({ items: [], has_more: false })),
    customerList: vi.fn(async () => ({ items: [], has_more: false })),
    articleList: vi.fn(async () => ({ items: [], has_more: false })),
    modelList: vi.fn(async () => ({ items: [], has_more: false })),
    regionGetHolidays: vi.fn(async () => ({ holidays: [] })),
    reportListConfigurations: vi.fn(async () => ({ items: [], has_more: false })),
    reportRun: vi.fn(async () => ({ job_id: 'j1', status: 'queued' })),
    shiftGetPlan: vi.fn(async () => ({ items: [], has_more: false })),
    shiftGetAvailability: vi.fn(async () => ({ items: [], has_more: false })),
    complianceCheckPeriod: vi.fn(async () => ({
      disclaimer: 'Hinweis, keine Rechtsberatung',
      findings: [],
    })),
    searchMasterData: vi.fn(async () => ({ ids: ['employee:e1'] })),
    fetchMasterData: vi.fn(async () => ({ id: 'employee:e1', name: 'Ada' })),
    issueConfirmToken: vi.fn(async () => 'tok-preview'),
    consumeConfirmToken: vi.fn(async () => true),
    audit: vi.fn(async () => undefined),
  };
  return { ...base, ...overrides };
}

describe('limits', () => {
  it('encodes and decodes cursors', () => {
    const c = encodeCursor({ offset: 50 });
    expect(decodeCursor(c)).toEqual({ offset: 50 });
    expect(decodeCursor(undefined)).toEqual({ offset: 0 });
  });

  it('normalizes paging with caps', () => {
    expect(normalizePaging({ limit: 9999 })).toEqual({ limit: 200, offset: 0 });
    expect(normalizePaging({ limit: 10, cursor: encodeCursor({ offset: 20 }) })).toEqual({
      limit: 10,
      offset: 20,
    });
  });

  it('slices pages', () => {
    const page = slicePage([1, 2, 3, 4, 5], 2, 2);
    expect(page.items).toEqual([3, 4]);
    expect(page.has_more).toBe(true);
    expect(page.next_cursor).toBeTruthy();
  });

  it('truncates oversized responses', () => {
    const items = Array.from({ length: 500 }, (_, i) => ({
      id: `item-${i}`,
      note: 'x'.repeat(200),
    }));
    const result = applyResponseBudget({ items, has_more: false });
    expect(result.truncated).toBe(true);
    expect(result.text.length).toBeLessThanOrEqual(25_000);
    expect((result.payload as { has_more: boolean }).has_more).toBe(true);
  });
});

describe('registry protocol', () => {
  const registry = createPlainStaffRegistry();

  it('initialize returns server info', async () => {
    const res = (await handleMcpJsonRpc(
      registry,
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: { clientInfo: { name: 'test' } } },
      auth(),
      mockBridge()
    )) as { result: { serverInfo: { name: string }; protocolVersion: string } };
    expect(res.result.serverInfo.name).toBe('plainstaff');
    expect(res.result.protocolVersion).toBeTruthy();
  });

  it('returns no response for notifications', async () => {
    const notification = (await handleMcpJsonRpc(
      registry,
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      auth(),
      mockBridge()
    )) as unknown;
    expect(notification).toBeNull();

    // A request without an id is a notification regardless of its method.
    const idless = (await handleMcpJsonRpc(
      registry,
      { jsonrpc: '2.0', method: 'ping' },
      auth(),
      mockBridge()
    )) as unknown;
    expect(idless).toBeNull();
  });

  it('every tool declares a rate bucket so the endpoint never guesses from the name', () => {
    for (const tool of registry.allTools()) {
      expect(['read', 'write', 'report']).toContain(tool.rateBucket);
    }
    expect(registry.getTool('plainstaff.time_get_bookings')?.rateBucket).toBe('read');
    expect(registry.getTool('plainstaff.time_book')?.rateBucket).toBe('write');
  });

  it('tools/list filters by scope', async () => {
    const res = (await handleMcpJsonRpc(
      registry,
      { jsonrpc: '2.0', id: 2, method: 'tools/list' },
      auth(['time:read']),
      mockBridge()
    )) as { result: { tools: Array<{ name: string }> } };
    const names = res.result.tools.map((t) => t.name);
    expect(names).toContain('plainstaff.time_get_bookings');
    expect(names).not.toContain('plainstaff.time_book');
    expect(names).not.toContain('plainstaff.project_list');
  });

  it('tools/call validates schema', async () => {
    const res = (await handleMcpJsonRpc(
      registry,
      {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: { name: 'plainstaff.time_get_bookings', arguments: { from: 'bad' } },
      },
      auth(),
      mockBridge()
    )) as { result: { isError?: boolean; content: Array<{ text: string }> } };
    expect(res.result.isError).toBe(true);
    expect(res.result.content[0].text).toContain('schema_violation');
  });

  it('tools/call invokes bridge for valid input', async () => {
    const bridge = mockBridge();
    const res = (await handleMcpJsonRpc(
      registry,
      {
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: {
          name: 'plainstaff.time_get_bookings',
          arguments: { from: '2026-01-01', to: '2026-01-31' },
        },
      },
      auth(),
      bridge
    )) as { result: { isError?: boolean } };
    expect(res.result.isError).toBeFalsy();
    expect(bridge.timeGetBookings).toHaveBeenCalled();
    expect(bridge.audit).toHaveBeenCalled();
  });

  it('rejects missing scope', async () => {
    const res = (await handleMcpJsonRpc(
      registry,
      {
        jsonrpc: '2.0',
        id: 5,
        method: 'tools/call',
        params: { name: 'plainstaff.project_list', arguments: {} },
      },
      auth(['time:read']),
      mockBridge()
    )) as { result: { isError?: boolean; content: Array<{ text: string }> } };
    expect(res.result.isError).toBe(true);
    expect(res.result.content[0].text).toContain('missing_scope');
  });

  it('search and fetch work', async () => {
    const bridge = mockBridge();
    const search = (await handleMcpJsonRpc(
      registry,
      {
        jsonrpc: '2.0',
        id: 6,
        method: 'tools/call',
        params: { name: 'search', arguments: { query: 'Ada' } },
      },
      auth(),
      bridge
    )) as { result: { content: Array<{ text: string }> } };
    expect(search.result.content[0].text).toContain('employee:e1');

    const fetchRes = (await handleMcpJsonRpc(
      registry,
      {
        jsonrpc: '2.0',
        id: 7,
        method: 'tools/call',
        params: { name: 'fetch', arguments: { id: 'employee:e1' } },
      },
      auth(),
      bridge
    )) as { result: { content: Array<{ text: string }> } };
    expect(fetchRes.result.content[0].text).toContain('Ada');
  });

  it('write tools issue confirm tokens on dry_run', async () => {
    const bridge = mockBridge();
    const res = (await handleMcpJsonRpc(
      registry,
      {
        jsonrpc: '2.0',
        id: 8,
        method: 'tools/call',
        params: {
          name: 'plainstaff.time_book',
          arguments: { date: '2026-01-15', duration_minutes: 60 },
        },
      },
      auth(),
      bridge
    )) as { result: { content: Array<{ text: string }> } };
    expect(res.result.content[0].text).toContain('confirm_token');
    expect(bridge.issueConfirmToken).toHaveBeenCalled();
  });

  it('lists prompts and resources', async () => {
    const prompts = (await handleMcpJsonRpc(
      registry,
      { jsonrpc: '2.0', id: 9, method: 'prompts/list' },
      auth(),
      mockBridge()
    )) as { result: { prompts: unknown[] } };
    expect(prompts.result.prompts.length).toBeGreaterThanOrEqual(4);

    const resources = (await handleMcpJsonRpc(
      registry,
      { jsonrpc: '2.0', id: 10, method: 'resources/list' },
      auth(),
      mockBridge()
    )) as { result: { resources: unknown[] } };
    expect(resources.result.resources.length).toBeGreaterThanOrEqual(3);
  });

  it('unknown method returns JSON-RPC error', async () => {
    const res = (await handleMcpJsonRpc(
      registry,
      { jsonrpc: '2.0', id: 11, method: 'nope' },
      auth(),
      mockBridge()
    )) as { error: { code: number } };
    expect(res.error.code).toBe(-32601);
  });
});

describe('errors', () => {
  it('McpToolError maps fields', () => {
    const err = new McpToolError('rate_limit', 'slow down', { retry_after_seconds: 12 });
    expect(err.errorClass).toBe('rate_limit');
    expect(err.details?.retry_after_seconds).toBe(12);
  });
});

describe('YUP contract map', () => {
  it('covers group-A tools', async () => {
    const { YUP_CONTRACT_MAP } = await import('../schemas/index.mjs');
    expect(YUP_CONTRACT_MAP['plainstaff.employee_list'].yupSchemaName).toBe('EmployeesGetV2');
    expect(YUP_CONTRACT_MAP['plainstaff.time_get_bookings'].requiredFields).toContain('from');
  });
});
