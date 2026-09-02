import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

const expectedTools = [
  'compare_trains',
  'get_availability',
  'get_provider_status',
  'get_train_details',
  'search_stations',
  'search_trains',
];

const child = spawn(process.execPath, ['dist/index.js'], {
  cwd: new URL('..', import.meta.url),
  stdio: ['pipe', 'pipe', 'pipe'],
});
const childExit = new Promise((resolve, reject) => {
  child.once('exit', resolve);
  child.once('error', reject);
});
const lines = createInterface({ input: child.stdout });
let stderr = '';
child.stderr.setEncoding('utf8');
child.stderr.on('data', (chunk) => {
  stderr += chunk;
});

const responses = new Map();
lines.on('line', (line) => {
  try {
    const message = JSON.parse(line);
    if (message.id !== undefined) responses.set(message.id, message);
  } catch {
    // Ignore non-protocol output here; the timeout/error report includes stderr.
  }
});

function send(message) {
  child.stdin.write(`${JSON.stringify(message)}\n`);
}

async function waitFor(id, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (responses.has(id)) return responses.get(id);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting for JSON-RPC response ${id}. ${stderr}`.trim());
}

try {
  send({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'reproducibility-smoke', version: '1.0.0' },
    },
  });
  const initialized = await waitFor(1);
  if (initialized.error || initialized.result?.serverInfo?.name !== 'china-rail-mcp') {
    throw new Error(`Unexpected initialize response: ${JSON.stringify(initialized)}`);
  }

  send({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} });
  send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
  const listed = await waitFor(2);
  const tools = listed.result?.tools;
  if (!Array.isArray(tools)) {
    throw new Error(`Unexpected tools/list response: ${JSON.stringify(listed)}`);
  }
  const actualTools = tools.map((tool) => tool.name).sort();
  if (JSON.stringify(actualTools) !== JSON.stringify(expectedTools)) {
    throw new Error(`Unexpected tool list: ${actualTools.join(', ')}`);
  }
  if (
    !tools.every(
      (tool) =>
        tool.annotations?.readOnlyHint === true && tool.annotations?.destructiveHint === false,
    )
  ) {
    throw new Error('Every tool must remain explicitly read-only and non-destructive.');
  }
  console.log(`stdio MCP smoke passed: initialized and listed ${tools.length} read-only tools.`);
} finally {
  child.stdin.end();
  const force = setTimeout(() => child.kill('SIGKILL'), 1_000);
  await childExit;
  clearTimeout(force);
}
