// functions/[[default.js]]

// 必填：你的 Umami 服务地址（不要以 / 结尾）
const UMAMI_URL = 'https://umami.gbfun.cc';

// 建议：允许的站点来源（CORS 白名单）
const ALLOW_ORIGINS = [
  'https://gbfun.cc',
  'https://blog.gbfun.cc',
];

// 必填：你的服务端 Bearer Token（只给 stats 用）。先用 /api/auth 换取
// 为了快速验证可先硬编码，正式使用请改为平台的环境变量注入。
const BEARER_TOKEN = 'qN6FaTV/4CSvF9y5eYmsLhSvSC8S8SJ4yarBYfGVkBy+TxWp1VZ3ta6P2wPnVDj+yrcF2M+VQl937sap8xE0X0YVcIs18aDCduO+Xi6xC7B9zTtizDp3qYuNJd50V9KlA3TGd6a+MZAkuOj3Prq1a5Ql/pbAkwDqld0gCHgu+f6UP8TUc5mLwPlK5+nwqSkKPnRtBd3uU3Wy9WR8CU7ZCT5xV+uIlQGzMCZNGQEMPAoj+lUU1aF5XrVvN8o9taZ1QZvWT2/fiFQs2+ih0B5ZwoyGA96rgSuGh2nD8/K8S4n81iBlazZb/NTYVtEtv4R1AcrJRPi6Wj2ZOdeMkrvpXjEtDyblwygDbXkbZI5CjEQFHVqLzV0pBt08/hzM';

// 可选：缓存策略（秒）
const CACHE_SECONDS_SCRIPT = 86400; // 24h
const CACHE_SECONDS_STATS  = 300;   // 5min

function corsHeaders(origin) {
  const allowed = ALLOW_ORIGINS.includes(origin) ? origin : '';
  if (!allowed) return {};
  return {
    'access-control-allow-origin': allowed,
    'access-control-allow-methods': 'GET,HEAD,POST,OPTIONS',
    'access-control-allow-headers': 'content-type,authorization',
    // 'access-control-max-age': '86400',
  };
}

async function withCors(response, origin, extra = {}) {
  const text = await response.text();
  return new Response(text, {
    status: response.status,
    statusText: response.statusText,
    headers: {
      ...Object.fromEntries(response.headers),
      ...corsHeaders(origin),
      ...extra,
    },
  });
}

function stripCookieRequest(req) {
  const url = new URL(req.url);
  const init = {
    method: req.method,
    headers: new Headers(req.headers),
    body: ['GET', 'HEAD'].includes(req.method) ? undefined : req.body,
  };
  init.headers.delete('cookie');
  init.headers.delete('Cookie');
  return new Request(url.toString(), init);
}

async function proxyScript(request, origin) {
  const cache = caches.default;
  const cacheHit = await cache.match(request);
  if (cacheHit) {
    // 命中缓存也补上 CORS 与类型
    return withCors(
      new Response(await cacheHit.text(), {
        status: cacheHit.status,
        headers: {
          ...Object.fromEntries(cacheHit.headers),
          'content-type': 'application/javascript; charset=utf-8',
        },
      }),
      origin
    );
  }

  const upstream = await fetch(`${UMAMI_URL}/script.js`, stripCookieRequest(request));
  const resp = await withCors(upstream, origin, {
    'content-type': 'application/javascript; charset=utf-8',
    'cache-control': `public, max-age=${CACHE_SECONDS_SCRIPT}`,
  });
  // 写入缓存
  eventWaitUntil(request, cache.put(request, resp.clone()));
  return resp;
}

async function proxySend(request, origin) {
  // /api/send 无需 Token，直接透传 JSON
  const upstream = await fetch(`${UMAMI_URL}/api/send`, stripCookieRequest(request));
  return withCors(upstream, origin, {
    'content-type': 'application/json; charset=utf-8',
  });
}

async function proxyStats(request, origin, pathname, search) {
  // /api/websites/:id/stats 需要 Bearer Token
  const req = stripCookieRequest(request);
  req.headers.set('authorization', `Bearer ${BEARER_TOKEN}`);
  req.headers.set('content-type', 'application/json');

  const upstream = await fetch(`${UMAMI_URL}${pathname}${search}`, req);
  const resp = await withCors(upstream, origin, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': `public, max-age=${CACHE_SECONDS_STATS}`,
  });

  // 可以按需加短缓存
  const cache = caches.default;
  eventWaitUntil(request, cache.put(request, resp.clone()));
  return resp;
}

function eventWaitUntil(request, promise) {
  // EdgeOne Page Function 与 CF Pages Functions 接近，但没有 event 形参；
  // 这里做个保险：如果运行环境支持 waitUntil，可从 globalThis 取用。
  // 不支持也不影响主流程。
  try {
    globalThis?.waitUntil?.(promise);
  } catch {}
}

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const { pathname, search } = url;
  const origin = request.headers.get('origin') || '';

  // 预检
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        ...corsHeaders(origin),
      },
    });
  }

  // 路由分发
  if (pathname === '/script.js') {
    return proxyScript(request, origin);
  }

  if (pathname === '/api/send') {
    return proxySend(request, origin);
  }

  // /api/websites/:id/stats
  if (/^\/api\/websites\/[0-9a-f-]+\/stats$/i.test(pathname)) {
    return proxyStats(request, origin, pathname, search);
  }

  // 其他路径：可返回 404 或你的自定义页
  return new Response('Not Found', { status: 404 });
}
