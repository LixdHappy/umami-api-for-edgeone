export async function onRequest() {
  try {
    console.log("ENV:", {
      API_BASE_URL: process.env.API_BASE_URL,
      TOKEN: process.env.TOKEN ? "[SET]" : "[MISSING]",
      WEBSITE_ID: process.env.WEBSITE_ID,
      KV_BOUND: typeof UMAMI_KV !== "undefined"
    });

    if (!process.env.API_BASE_URL || !process.env.TOKEN || !process.env.WEBSITE_ID) {
      return new Response(JSON.stringify({ error: "Missing env vars" }), { status: 500 });
    }

    // KV 测试
    try {
      await UMAMI_KV.put("test_key", "ok", { expirationTtl: 10 });
      const testVal = await UMAMI_KV.get("test_key");
      console.log("KV test value:", testVal);
    } catch (kvErr) {
      console.error("KV error:", kvErr);
    }

    // 简单 fetch 测试
    try {
      const res = await fetch(process.env.API_BASE_URL, { method: "HEAD" });
      console.log("Fetch test status:", res.status);
    } catch (fetchErr) {
      console.error("Fetch error:", fetchErr);
      return new Response(JSON.stringify({ error: "Fetch failed", details: fetchErr.message }), { status: 502 });
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (err) {
    console.error("Unhandled error:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
