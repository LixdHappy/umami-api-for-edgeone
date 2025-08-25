const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function jsonResponse(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, s-maxage=300, max-age=60', // HTTP 缓存头
      ...extraHeaders,
    },
  });
}

export async function onRequestOptions() {
  return new Response(null, { headers: corsHeaders });
}

export async function onRequest() {
  const API_BASE_URL = process.env.API_BASE_URL;
  const TOKEN = process.env.TOKEN;
  const WEBSITE_ID = process.env.WEBSITE_ID;

  if (!API_BASE_URL || !TOKEN || !WEBSITE_ID) {
    return jsonResponse(
      { error: 'Missing required environment variables' },
      500
    );
  }

  const cacheKey = 'umami_stats_v1';

  // 1️⃣ 先查 KV 缓存
  try {
    const cached = await UMAMI_KV.get(cacheKey);
    if (cached) {
      return jsonResponse(JSON.parse(cached), 200, { 'X-Cache': 'HIT' });
    }
  } catch (err) {
    console.error('KV get error:', err);
  }

  // 2️⃣ 没命中缓存 → 请求 Umami API
  async function fetchStats(startAt, endAt) {
    const url = `${API_BASE_URL}/api/websites/${WEBSITE_ID}/stats?startAt=${startAt}&endAt=${endAt}`;
    try {
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          'Content-Type': 'application/json',
        },
      });
      if (!res.ok) {
        return { ok: false, status: res.status, body: await res.text() };
      }
      return { ok: true, body: await res.json() };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  const now = Date.now();
  const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
  const startOfYesterday = new Date(startOfToday.getTime() - 86400000);
  const startOfLastMonth = new Date(); startOfLastMonth.setMonth(startOfLastMonth.getMonth() - 1);
  const startOfLastYear = new Date(); startOfLastYear.setFullYear(startOfLastYear.getFullYear() - 1);

  const [today, yesterday, month, year] = await Promise.all([
    fetchStats(startOfToday.getTime(), now),
    fetchStats(startOfYesterday.getTime(), startOfToday.getTime()),
    fetchStats(startOfLastMonth.getTime(), now),
    fetchStats(startOfLastYear.getTime(), now),
  ]);

  const payload = { today, yesterday, month, year };

  // 3️⃣ 写入 KV 缓存（300 秒过期）
  try {
    await UMAMI_KV.put(cacheKey, JSON.stringify(payload), { expirationTtl: 300 });
  } catch (err) {
    console.error('KV put error:', err);
  }

  return jsonResponse(payload, 200, { 'X-Cache': 'MISS' });
}
