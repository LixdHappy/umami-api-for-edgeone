// functions/api/umami.js

export async function onRequest(context) {
  const { API_BASE_URL, TOKEN, WEBSITE_ID, UMAMI_KV } = context.env;

  // 1. 检查环境变量
  if (!API_BASE_URL || !TOKEN || !WEBSITE_ID) {
    return new Response(
      JSON.stringify({ error: 'Missing required environment variables' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // 2. 生成缓存 key（按 URL 参数区分）
  const url = new URL(context.request.url);
  const cacheKey = `umami:${url.searchParams.toString() || 'default'}`;

  // 3. 先查 KV 缓存
  let cached = await UMAMI_KV.get(cacheKey);
  if (cached) {
    return new Response(cached, {
      headers: { 'Content-Type': 'application/json', 'X-Cache': 'HIT' }
    });
  }

  // 4. 请求 Umami API
  const apiUrl = `${API_BASE_URL}/api/websites/${WEBSITE_ID}/stats`;
  const res = await fetch(apiUrl, {
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json'
    }
  });

  if (!res.ok) {
    return new Response(
      JSON.stringify({ error: `Upstream error: ${res.status}` }),
      { status: res.status, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const data = await res.text();

  // 5. 写入 KV 缓存（例如缓存 300 秒）
  await UMAMI_KV.put(cacheKey, data, { expirationTtl: 300 });

  // 6. 返回结果
  return new Response(data, {
    headers: { 'Content-Type': 'application/json', 'X-Cache': 'MISS' }
  });
}
