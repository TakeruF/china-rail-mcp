import { access, readFile } from 'node:fs/promises';

const requiredMajor = 20;
const actualMajor = Number.parseInt(process.versions.node.split('.')[0] ?? '', 10);
const failures = [];

if (!Number.isInteger(actualMajor) || actualMajor < requiredMajor) {
  failures.push(`Node.js ${requiredMajor}+ is required; found ${process.version}.`);
}

for (const path of ['package-lock.json', 'src/index.ts', 'src/server.ts']) {
  try {
    await access(new URL(`../${path}`, import.meta.url));
  } catch {
    failures.push(`Required repository file is missing: ${path}`);
  }
}

try {
  const packageJson = JSON.parse(
    await readFile(new URL('../package.json', import.meta.url), 'utf8'),
  );
  if (packageJson.name !== 'china-rail-mcp') {
    failures.push('Run this command from a complete china-rail-mcp checkout.');
  }
} catch {
  failures.push('package.json is missing or invalid.');
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`ERROR: ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Environment ready: Node ${process.version}, ${process.platform}/${process.arch}.`);
  console.log('Local stdio mode requires no credentials or environment variables.');
}
