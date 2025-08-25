// functions/api/umami.js
export async function onRequestGet(context) {
  const { env, request, waitUntil } = context;

  const API_BASE_URL = env.API_BASE_URL;  // 你的 Umami 实例，例如 https://umami.example.com
  const TOKEN = env.TOKEN;                // Umami API Token
  const WEBSITE_ID = env.WEBSITE_ID;      // Umami 网站 ID

  const now = Date.now();
  const todayStart = new Date(now).setHours(0, 0, 0, 0);
  const yesterdayStart = todayStart - 86400000;
  const lastMonthStart = new Date(now).setMonth(new Date().getMonth() - 1).getTime();
  const lastYearStart = new Date(now).setFullYear(new Date().getFullYear() - 1).getTime();

  // 缓存 API
  const cache = caches.default;
  const cached = await cache.match(request);
  if (cached) return cached;

  // 请求 Umami
  async function fetchStats(startAt, endAt) {
    const res = await fetch(`${API_BASE_URL}/api/websites/${WEBSITE_ID}/stats?startAt=${startAt}&endAt=${endAt}`, {
      headers: { "Authorization": `Bearer ${TOKEN}` }
    });
    return res.ok ? res.json() : null;
  }

  const [today, yesterday, month, year] = await Promise.all([
    fetchStats(todayStart, now),
    fetchStats(yesterdayStart, todayStart),
    fetchStats(lastMonthStart, now),
    fetchStats(lastYearStart, now)
  ]);

  const data = {
    today_uv: today?.visitors?.value ?? 0,
    today_pv: today?.pageviews?.value ?? 0,
    yesterday_uv: yesterday?.visitors?.value ?? 0,
    yesterday_pv: yesterday?.pageviews?.value ?? 0,
    last_month_pv: month?.pageviews?.value ?? 0,
    last_year_pv: year?.pageviews?.value ?? 0,
  };

  const response = new Response(JSON.stringify(data), {
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    }
  });

  waitUntil(cache.put(request, response.clone()));
  return response;
}
