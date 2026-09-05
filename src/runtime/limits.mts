import {
  MCP_DEFAULT_PAGE_LIMIT,
  MCP_MAX_PAGE_LIMIT,
  MCP_RESPONSE_BUDGET_CHARS,
  type McpPageResult,
  type McpPagingInput,
} from '../types.mjs';

export interface TruncationResult {
  payload: unknown;
  truncated: boolean;
  text: string;
}

/**
 * Serialize a tool payload within the response budget.
 * On overflow: truncate arrays when possible, set has_more + next_cursor, add hint.
 */
export function applyResponseBudget(payload: unknown, budget = MCP_RESPONSE_BUDGET_CHARS): TruncationResult {
  const full = JSON.stringify(payload);
  if (full.length <= budget) {
    return { payload, truncated: false, text: full };
  }

  if (payload && typeof payload === 'object' && Array.isArray((payload as { items?: unknown }).items)) {
    const page = payload as McpPageResult<unknown> & Record<string, unknown>;
    let items = [...page.items];
    let lo = 0;
    let hi = items.length;
    let best = 0;
    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      const candidate = {
        ...page,
        items: items.slice(0, mid),
        has_more: true,
        next_cursor: page.next_cursor ?? encodeCursor({ offset: mid }),
        _truncated_hint:
          'Response truncated to fit context budget. Narrow your filters or follow next_cursor.',
      };
      const text = JSON.stringify(candidate);
      if (text.length <= budget) {
        best = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    items = items.slice(0, Math.max(1, best));
    const truncatedPayload = {
      ...page,
      items,
      has_more: true,
      next_cursor: page.next_cursor ?? encodeCursor({ offset: items.length }),
      _truncated_hint:
        'Response truncated to fit context budget. Narrow your filters or follow next_cursor.',
    };
    return { payload: truncatedPayload, truncated: true, text: JSON.stringify(truncatedPayload) };
  }

  const hintPayload = {
    error: 'response_too_large',
    message:
      'Result exceeded the 25 000 character budget. Narrow the date range or filters and retry.',
    preview: full.slice(0, Math.min(2000, budget - 200)),
  };
  return { payload: hintPayload, truncated: true, text: JSON.stringify(hintPayload) };
}

export function normalizePaging(input: McpPagingInput | undefined): { limit: number; offset: number } {
  const limit = Math.min(
    Math.max(1, input?.limit ?? MCP_DEFAULT_PAGE_LIMIT),
    MCP_MAX_PAGE_LIMIT
  );
  const offset = decodeCursor(input?.cursor).offset;
  return { limit, offset };
}

export function encodeCursor(data: { offset: number }): string {
  return Buffer.from(JSON.stringify(data), 'utf8').toString('base64url');
}

export function decodeCursor(cursor: string | undefined): { offset: number } {
  if (!cursor) {
    return { offset: 0 };
  }
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as { offset?: number };
    return { offset: Math.max(0, Number(parsed.offset) || 0) };
  } catch {
    return { offset: 0 };
  }
}

export function slicePage<T>(all: T[], limit: number, offset: number): McpPageResult<T> {
  const items = all.slice(offset, offset + limit);
  const hasMore = offset + limit < all.length;
  return {
    items,
    has_more: hasMore,
    ...(hasMore ? { next_cursor: encodeCursor({ offset: offset + limit }) } : {}),
  };
}

export function toToolContent(payload: unknown): { content: Array<{ type: 'text'; text: string }>; structuredContent: Record<string, unknown> } {
  const { text, payload: finalPayload } = applyResponseBudget(payload);
  return {
    content: [{ type: 'text', text }],
    structuredContent: (typeof finalPayload === 'object' && finalPayload !== null
      ? finalPayload
      : { value: finalPayload }) as Record<string, unknown>,
  };
}
