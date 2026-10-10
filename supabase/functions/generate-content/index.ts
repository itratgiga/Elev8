// Legacy endpoint. Older browser tabs and cached app builds still call this name.
// It now forwards to generate-media so every user gets the same model photoshoot, whatever build they run.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "POST only" }), { status: 405, headers: { ...CORS, "Content-Type": "application/json" } });
  let body: { product_id?: string } = {};
  try { body = await req.json(); } catch { /* handled below */ }
  const url = Deno.env.get("SUPABASE_URL")!;
  const res = await fetch(`${url}/functions/v1/generate-media`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: req.headers.get("Authorization") ?? "",
      apikey: req.headers.get("apikey") ?? "",
    },
    body: JSON.stringify({ product_id: body.product_id, media: "photo", count: 0, who: "auto", look: "studio" }),
  });
  return new Response(await res.text(), { status: res.status, headers: { ...CORS, "Content-Type": "application/json" } });
});
