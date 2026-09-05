#!/usr/bin/env node
/**
 * stdio → HTTPS proxy for the PlainStaff remote MCP endpoint (AD-3).
 *
 * Env:
 *   PLAINSTAFF_MCP_URL   default https://api.plainstaff.com/mcp
 *   PLAINSTAFF_API_KEY   optional API-key auth (Bearer omitted)
 *   PLAINSTAFF_ACCESS_TOKEN  OAuth access token (preferred)
 *   PLAINSTAFF_MCP_LANG  de|en (default en)
 */
import { createInterface } from 'node:readline';
import { stdin as input, stdout as output, stderr } from 'node:process';

const MCP_URL = process.env.PLAINSTAFF_MCP_URL || 'https://api.plainstaff.com/mcp';
const ACCESS_TOKEN = process.env.PLAINSTAFF_ACCESS_TOKEN || '';
const API_KEY = process.env.PLAINSTAFF_API_KEY || '';
const LANG = process.env.PLAINSTAFF_MCP_LANG || 'en';

if (!ACCESS_TOKEN && !API_KEY) {
  stderr.write(
    'plainstaff-mcp-server: set PLAINSTAFF_ACCESS_TOKEN (OAuth) or PLAINSTAFF_API_KEY\n'
  );
  process.exit(1);
}

function isNotification(message: unknown): boolean {
  return (
    !!message &&
    typeof message === 'object' &&
    (message as { id?: unknown }).id === undefined
  );
}

async function forward(message: unknown): Promise<unknown> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    accept: 'application/json',
    'accept-language': LANG,
  };
  if (ACCESS_TOKEN) {
    headers.authorization = `Bearer ${ACCESS_TOKEN}`;
  } else {
    headers['plainstaff-api-key'] = API_KEY;
  }

  const res = await fetch(MCP_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify(message),
  });

  // Notifications are answered with 202 and an empty body — nothing to write back.
  if (res.status === 202) {
    return null;
  }

  const text = await res.text();
  if (!text.trim()) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return {
      jsonrpc: '2.0',
      id: (message as { id?: unknown })?.id ?? null,
      error: {
        code: -32000,
        message: `Upstream HTTP ${res.status}: ${text.slice(0, 500)}`,
      },
    };
  }
}

const rl = createInterface({ input, crlfDelay: Infinity });

rl.on('line', async (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let message: unknown;
  try {
    message = JSON.parse(trimmed);
  } catch {
    output.write(
      JSON.stringify({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32700, message: 'Parse error' },
      }) + '\n'
    );
    return;
  }

  try {
    const response = await forward(message);
    // A notification carries no id and must not be answered.
    if (response != null && !isNotification(message)) {
      output.write(JSON.stringify(response) + '\n');
    }
  } catch (err) {
    if (isNotification(message)) {
      return;
    }
    output.write(
      JSON.stringify({
        jsonrpc: '2.0',
        id: (message as { id?: unknown })?.id ?? null,
        error: {
          code: -32000,
          message: err instanceof Error ? err.message : 'Proxy error',
        },
      }) + '\n'
    );
  }
});

rl.on('close', () => {
  process.exit(0);
});
