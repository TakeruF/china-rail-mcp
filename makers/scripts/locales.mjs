import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const locales = [
  { code: 'ja', lang: 'ja', name: '日本語' },
  { code: 'zh', lang: 'zh-CN', name: '中文' },
  { code: 'ko', lang: 'ko', name: '한국어' },
  { code: 'en', lang: 'en', name: 'English' },
];

function escapeHtml(value) {
  return value.replace(
    /[&<>"']/gu,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char],
  );
}

export async function buildDirectory(root, output) {
  const template = await readFile(path.join(root, 'makers/templates/directory.html'), 'utf8');
  const hash = async (file) =>
    createHash('sha256')
      .update(await readFile(path.join(output, 'public', file)))
      .digest('hex')
      .slice(0, 12);
  const cssHash = await hash('hub.css');
  const jsHash = await hash('hub.js');
  let expectedKeys;
  for (const locale of locales) {
    const messages = JSON.parse(
      await readFile(path.join(root, `makers/locales/${locale.code}.json`), 'utf8'),
    );
    const keys = Object.keys(messages).sort().join(',');
    expectedKeys ??= keys;
    if (
      keys !== expectedKeys ||
      Object.values(messages).some((text) => typeof text !== 'string' || !text.trim())
    ) {
      throw new Error(`Incomplete directory translation: ${locale.code}`);
    }
    const values = {
      ...Object.fromEntries(
        Object.entries(messages).map(([key, value]) => [key, escapeHtml(value)]),
      ),
      locale: locale.code,
      htmlLang: locale.lang,
      languageName: locale.name,
      cssHash,
      jsHash,
      languageLinks: locales
        .map(
          (item) =>
            `<a href="/${item.code}" lang="${item.lang}" hreflang="${item.lang}"${item.code === locale.code ? ' aria-current="page"' : ''}>${item.name}</a>`,
        )
        .join('\n'),
      alternates: [...locales, { code: 'en', lang: 'x-default' }]
        .map(
          (item) =>
            `<link rel="alternate" hreflang="${item.lang}" href="https://mcp.takeruf.com/${item.code}" />`,
        )
        .join('\n'),
    };
    const html = template.replace(/\{\{(\w+)\}\}/gu, (_, key) => {
      if (!(key in values)) throw new Error(`Missing directory value: ${locale.code}/${key}`);
      return values[key];
    });
    const directory = path.join(output, 'public', locale.code);
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, 'index.html'), html);
  }
}
