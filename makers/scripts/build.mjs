import { build, transform } from 'esbuild';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { buildDirectory, locales } from './locales.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const output = path.join(root, 'makers/.output');
await rm(output, { recursive: true, force: true });
await mkdir(path.join(output, 'cloud-functions'), { recursive: true });
await cp(path.join(root, 'makers/public'), path.join(output, 'public'), { recursive: true });
// Keep the browser payload small without introducing a framework or runtime dependency.
await Promise.all(
  ['hub.css', 'hub.js', 'locale-redirect.js'].map(async (name) => {
    const file = path.join(output, 'public', name);
    const css = name.endsWith('.css');
    const result = await transform(await readFile(file, 'utf8'), {
      loader: css ? 'css' : 'js',
      minify: true,
      ...(css ? {} : { target: 'es2022', format: 'iife' }),
    });
    await writeFile(file, result.code);
  }),
);
await buildDirectory(root, output);
await build({
  entryPoints: [path.join(root, 'cloud-functions/router.ts')],
  outfile: path.join(output, 'runtime.mjs'),
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  // Makers adds its own onRequest binding; keep bundled internal handlers distinct.
  minifyIdentifiers: true,
});
await writeFile(
  path.join(output, 'cloud-functions/[[default]].js'),
  "import { handleRequest } from '../runtime.mjs';\nexport async function onRequest({ request, env = {} }) { return handleRequest({ request, env: { ...process.env, ...env } }); }\n",
);
await writeFile(
  path.join(output, 'package.json'),
  JSON.stringify({ private: true, type: 'module' }, null, 2),
);
await writeFile(
  path.join(output, 'edgeone.json'),
  JSON.stringify(
    {
      buildCommand: 'echo MCP hub bundle is ready',
      outputDirectory: 'public',
      cloudFunctions: { regions: { overseas: ['ap-hongkong'] }, maxDuration: 120 },
      rewrites: locales.flatMap(({ code }) => [
        { source: `/${code}`, destination: `/${code}/index.html` },
        { source: `/${code}/`, destination: `/${code}/index.html` },
      ]),
      headers: [
        {
          source: '/*',
          headers: [
            { key: 'X-Content-Type-Options', value: 'nosniff' },
            { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
            { key: 'X-Frame-Options', value: 'DENY' },
          ],
        },
      ],
    },
    null,
    2,
  ),
);
console.log(`EdgeOne bundle ready: ${output}`);
