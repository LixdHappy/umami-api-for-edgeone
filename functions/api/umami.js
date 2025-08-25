// EdgeOne Pages Functions 版本的 Umami API 中转 + 缓存
// 路由：/api/umami
// 环境变量：API_BASE_URL, TOKEN, WEBSITE_ID

const CACHE_NAME = 'umami_cache_v1';
const CACHE_SECONDS = 600; // 可按需调整

const corsBaseHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function withCors(headers = {}) {
  const h = new Headers(headers);
  Object.entries(corsBaseHeaders).forEach(([k, v]) => h.set(k, v));
  return h;
}

function json(data, init = {}) {
  const headers = withCors({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': `public, max-age=${CACHE_SECONDS}`,
    ...(init.headers || {}),
  });
  return new Response(JSON.stringify(data), { ...init, headers });
}

async function fetchUmamiData(base, token, websiteId, startAt, endAt) {
  const url = `${base}/api/websites/${websiteId}/stats?startAt=${startAt}&endAt=${endAt}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) {
    // 透传错误但不中断整体聚合
    return { ok: false, status: res.status, statusText: res.statusText };
  }
  const body = await res.json();
  return { ok: true, body };
}

function startOfTodayMs(now) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function startOfYesterdayMs(now) {
  const d = new Date(now - 86400000);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function startOfLastMonthMs(now) {
  const d = new Date(now);
  d.setMonth(d.getMonth() - 1);
  return d.getTime();
}

function startOfLastYearMs(now) {
  const d = new Date(now);
  d.setFullYear(d.getFullYear() - 1);
  return d.getTime();
}

export async function onRequestOptions() {
  return new Response(null, { headers: withCors() });
}

export async function onRequest({ request }) {
  if (request.method !== 'GET') {
    return new Response(null, { status: 405, headers: withCors() });
  }

  const API_BASE_URL = process.env.API_BASE_URL;
  const TOKEN = process.env.TOKEN;
  const WEBSITE_ID = process.env.WEBSITE_ID;

  if (!API_BASE_URL || !TOKEN || !WEBSITE_ID) {
    return json(
      { error: 'Missing required environment variables: API_BASE_URL, TOKEN, WEBSITE_ID' },
      { status: 500 }
    );
  }

  const url = new URL(request.url);
  const now = Date.now();

  // 允许通过查询参数覆盖默认区间（可选）
  const nowMs = Number(url.searchParams.get('now')) || now;
  const todayStart = Number(url.searchParams.get('todayStart')) || startOfTodayMs(nowMs);
  const yesterdayStart = Number(url.searchParams.get('yesterdayStart')) || startOfYesterdayMs(nowMs);
  const lastMonthStart = Number(url.searchParams.get('lastMonthStart')) || startOfLastMonthMs(nowMs);
  const lastYearStart = Number(url.searchParams.get('lastYearStart')) || startOfLastYearMs(nowMs);

  // 边缘缓存（如不可用则仅依赖 HTTP 缓存头）
  const cacheKey = new Request(url.toString(), {
    headers: { Accept: 'application/json' },
  });
  const cache = 'caches' in globalThis ? await caches.open(CACHE_NAME) : null;

  if (cache) {
    const hit = await cache.match(cacheKey);
    if (hit) {
      // 追加 CORS 头再返回
      const h = new Headers(hit.headers);
      Object.entries(corsBaseHeaders).forEach(([k, v]) => h.set(k, v));
      return new Response(await hit.blob(), { status: hit.status, headers: h });
    }
  }

  const [todayRes, yesterdayRes, monthRes, yearRes] = await Promise.all([
    fetchUmamiData(API_BASE_URL, TOKEN, WEBSITE_ID, todayStart, nowMs),
    fetchUmamiData(API_BASE_URL, TOKEN, WEBSITE_ID, yesterdayStart, todayStart),
    fetchUmamiData(API_BASE_URL, TOKEN, WEBSITE_ID, lastMonthStart, nowMs),
    fetchUmamiData(API_BASE_URL, TOKEN, WEBSITE_ID, lastYearStart, nowMs),
  ]);

  const safePick = (res, key) =>
    res?.ok ? (res.body?.[key]?.value ?? null) : null;

  const payload = {
    today_uv: safePick(todayRes, 'visitors'),
    today_pv: safePick(todayRes, 'pageviews'),
    yesterday_uv: safePick(yesterdayRes, 'visitors'),
    yesterday_pv: safePick(yesterdayRes, 'pageviews'),
    last_month_pv: safePick(monthRes, 'pageviews'),
    last_year_pv: safePick(yearRes, 'pageviews'),
    // 可选返回错误信息辅助排查（生产可移除）
    _errors: {
      today: todayRes?.ok ? null : todayRes,
      yesterday: yesterdayRes?.ok ? null : yesterdayRes,
      month: monthRes?.ok ? null : monthRes,
      year: yearRes?.ok ? null : yearRes,
    },
  };

  const response = json(payload, { status: 200 });

  if (cache) {
    // 异步写入缓存
    contextWaitUntil(cache.put(cacheKey, response.clone()));
  }

  return response;
}

// 在某些环境中没有 context.waitUntil，这里做一次兜底
function contextWaitUntil(promise) {
  try {
    // @ts-ignore
    if (typeof waitUntil === 'function') return waitUntil(promise);
  } catch {}
  // 静默处理
  promise.catch(() => {});
}
