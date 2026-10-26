import { expect, it } from 'vitest';
import { authorizationLocale } from '../cloud-functions/oauth-locale.js';

it.each([
  ['', '', 'en'],
  ['', 'fr, ko-KR;q=0.8, en;q=0.6', 'ko'],
  ['', 'en;q=0.5, zh-TW;q=0.9, ja;q=0.7', 'zh'],
  ['', 'ko;q=0, ja-JP;q=0.6', 'ja'],
  ['', 'ja;q=invalid, zh;q=2, en;q=0', 'en'],
  ['?lang=zh', 'ja-JP', 'zh'],
  ['?lang=ko', 'en-US', 'ko'],
  ['?lang=unknown', 'ja-JP', 'ja'],
])('selects consent language for %s / %s', (query, language, expected) => {
  expect(
    authorizationLocale(
      new Request(`https://mcp.example/china-rail/authorize${query}`, {
        headers: { 'accept-language': language },
      }),
    ),
  ).toBe(expected);
});
