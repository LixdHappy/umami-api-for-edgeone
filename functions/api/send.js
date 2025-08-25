export async function onRequest(context) {
  return new Response(
    JSON.stringify({ message: "ok", time: new Date().toISOString() }),
    {
      headers: { "Content-Type": "application/json" },
    }
  );
}