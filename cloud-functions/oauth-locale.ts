export const oauthLocales = {
  ja: {
    lang: 'ja',
    name: '日本語',
    language: '言語',
    title: 'China Rail MCP を認証',
    introduction:
      'AIクライアントに、公式12306の時刻表・運賃・停車駅・余票を読み取る権限を与えます。',
    password: '接続用パスワード',
    submit: '接続を許可',
    note: '12306へのログイン、予約、支払い、鉄道アカウントの変更には対応していません。',
  },
  zh: {
    lang: 'zh-CN',
    name: '中文',
    language: '语言',
    title: '授权 China Rail MCP',
    introduction: '允许 AI 客户端以只读方式查询官方12306的时刻表、票价、经停站和余票。',
    password: '连接密码',
    submit: '允许连接',
    note: '本服务无法登录12306、订票、支付或修改铁路账号。',
  },
  ko: {
    lang: 'ko',
    name: '한국어',
    language: '언어',
    title: 'China Rail MCP 인증',
    introduction:
      'AI 클라이언트가 공식 12306의 시간표, 운임, 정차역 및 잔여 좌석을 읽기 전용으로 조회하도록 허용합니다.',
    password: '연결 비밀번호',
    submit: '연결 허용',
    note: '12306 로그인, 승차권 예약, 결제 또는 철도 계정 변경은 지원하지 않습니다.',
  },
  en: {
    lang: 'en',
    name: 'English',
    language: 'Language',
    title: 'Authorize China Rail MCP',
    introduction:
      'Allow your AI client to use the read-only official 12306 timetable, fare, stop, and seat-availability tools.',
    password: 'Connection password',
    submit: 'Allow connection',
    note: 'This integration cannot log in to 12306, book tickets, make payments, or modify railway accounts.',
  },
} as const;

type Locale = keyof typeof oauthLocales;

function supported(value: string): Locale | undefined {
  const code = value.trim().toLowerCase().split('-')[0];
  return code && Object.hasOwn(oauthLocales, code) ? (code as Locale) : undefined;
}

export function authorizationLocale(request: Request): Locale {
  const explicit = supported(new URL(request.url).searchParams.get('lang') ?? '');
  if (explicit) return explicit;
  const preferred = (request.headers.get('accept-language') ?? '')
    .split(',')
    .map((entry) => {
      const [tag = '', ...parameters] = entry.trim().split(';');
      const quality = parameters.find((item) => item.trim().startsWith('q='));
      return { locale: supported(tag), weight: quality ? Number(quality.trim().slice(2)) : 1 };
    })
    .filter((item) => item.locale && item.weight > 0 && item.weight <= 1)
    .sort((a, b) => b.weight - a.weight);
  return preferred[0]?.locale ?? 'en';
}
