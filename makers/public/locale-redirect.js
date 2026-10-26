const supported = new Set(['en', 'ja', 'zh', 'ko']);
const locale =
  (navigator.languages ?? [navigator.language])
    .map((language) => language.toLowerCase().split('-')[0])
    .find((language) => supported.has(language)) ?? 'en';
location.replace(`/${locale}${location.search}${location.hash}`);
