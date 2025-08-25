// 调试版：移除 caches API，增加错误捕获
// 环境变量：API_BASE_URL, TOKEN, WEBSITE_ID

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
}

export async function onRequestOptions() {
  return new Response(null, { headers: corsHeaders });
}

export async function onRequest({ request }) {
  if (request.method !== 'GET') {
    return jsonResponse({ error: 'Method Not Allowed' }, 405);
  }

  const API_BASE_URL = process.env.API_BASE_URL;
  const TOKEN = process.env.TOKEN;
  const WEBSITE_ID = process.env.WEBSITE_ID;

  if (!API_BASE_URL || !TOKEN || !WEBSITE_ID) {
    return jsonResponse(
      {
        error: 'Missing required environment variables',
        got: {
          API_BASE_URL: !!API_BASE_URL,
          TOKEN: !!TOKEN,
          WEBSITE_ID: !!WEBSITE_ID,
        },
      },
      500
    );
  }

  const now = Date.now();
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const startOfYesterday = new Date(startOfToday.getTime() - 86400000);
  const startOfLastMonth = new Date();
  startOfLastMonth.setMonth(startOfLastMonth.getMonth() - 1);
  const startOfLastYear = new Date();
  startOfLastYear.setFullYear(startOfLastYear.getFullYear() - 1);

  async function fetchStats(startAt, endAt) {
    const url = `${API_BASE_URL}/api/websites/${WEBSITE_ID}/stats?startAt=${startAt}&endAt=${endAt}`;
    try {
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          'Content-Type': 'application/json',
        },
      });
      const text = await res.text();
      let body;
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
      return { ok: res.ok, status: res.status, body };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  const [today, yesterday, month, year] = await Promise.all([
    fetchStats(startOfToday.getTime(), now),
    fetchStats(startOfYesterday.getTime(), startOfToday.getTime()),
    fetchStats(startOfLastMonth.getTime(), now),
    fetchStats(startOfLastYear.getTime(), now),
  ]);

  return jsonResponse({
    today,
    yesterday,
    month,
    year,
  });
}
