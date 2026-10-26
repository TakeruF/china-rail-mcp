import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { locales } from './locales.mjs';

const output = fileURLToPath(new URL('../.output/', import.meta.url));
const files = [
  'runtime.mjs',
  'cloud-functions/[[default]].js',
  'package.json',
  'edgeone.json',
  'public/index.html',
  'public/hub.css',
  'public/hub.js',
  'public/locale-redirect.js',
  ...locales.map(({ code }) => `public/${code}/index.html`),
];
// Upload only the explicit deployment files. Local CLI links and .env files stay local.
// A deterministic, uncompressed ZIP avoids an additional packaging dependency.
const crcTable = Uint32Array.from({ length: 256 }, (_, n) => {
  for (let bit = 0; bit < 8; bit++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
const local = [],
  central = [];
let offset = 0;
for (const file of files) {
  const name = Buffer.from(file),
    data = await readFile(path.join(output, file));
  let crc = 0xffffffff;
  for (const byte of data) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  crc = (crc ^ 0xffffffff) >>> 0;
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(33, 12);
  header.writeUInt32LE(crc, 14);
  header.writeUInt32LE(data.length, 18);
  header.writeUInt32LE(data.length, 22);
  header.writeUInt16LE(name.length, 26);
  const index = Buffer.alloc(46);
  index.writeUInt32LE(0x02014b50);
  index.writeUInt16LE(20, 4);
  index.writeUInt16LE(20, 6);
  index.writeUInt16LE(33, 14);
  index.writeUInt32LE(crc, 16);
  index.writeUInt32LE(data.length, 20);
  index.writeUInt32LE(data.length, 24);
  index.writeUInt16LE(name.length, 28);
  index.writeUInt32LE(offset, 42);
  local.push(header, name, data);
  central.push(index, name);
  offset += header.length + name.length + data.length;
}
const directory = Buffer.concat(central),
  end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50);
end.writeUInt16LE(files.length, 8);
end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(directory.length, 12);
end.writeUInt32LE(offset, 16);
const archive = path.join(output, 'hub.zip');
await writeFile(archive, Buffer.concat([...local, directory, end]));
if (process.argv.includes('--archive-only')) {
  console.log(JSON.stringify({ archive, files }));
  process.exit(0);
}
const project = process.argv[2] ?? 'takeruf-mcp';
const child = spawn(
  process.platform === 'win32' ? 'npm.cmd' : 'npm',
  [
    'exec',
    '--yes',
    '--package=edgeone@1.6.46',
    '--',
    'edgeone',
    'makers',
    'deploy',
    archive,
    '-n',
    project,
    '-e',
    'production',
    '-a',
    'overseas',
    '--json',
    '--skip-ai-gateway-sync',
  ],
  { cwd: output, stdio: ['ignore', 'pipe', 'pipe'] },
);
let log = '';
child.stdout.on('data', (chunk) => {
  log += chunk;
});
child.stderr.on('data', (chunk) => {
  log += chunk;
});
const code = await new Promise((resolve, reject) => {
  child.on('error', reject);
  child.on('close', resolve);
});
const publicResult = { project, exitCode: code };
for (const line of log.split('\n')) {
  try {
    const parsed = JSON.parse(line);
    if (parsed && typeof parsed === 'object' && 'status' in parsed) {
      for (const [key, value] of Object.entries(parsed)) {
        if (
          /^(status|projectId|projectName|deploymentId|url|previewUrl|consoleUrl)$/iu.test(key) &&
          typeof value === 'string'
        )
          publicResult[key] = value;
      }
    }
  } catch {
    // CLI logs can contain environment values and temporary credentials; never echo them.
  }
}
await writeFile(path.join(output, 'deployment.json'), JSON.stringify(publicResult, null, 2));
console.log(JSON.stringify(publicResult));
if (code !== 0) process.exitCode = 1;
