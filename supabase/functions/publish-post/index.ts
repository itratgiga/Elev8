import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const GRAPH = "https://graph.facebook.com/v21.0";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function jwtRole(token: string): string | null {
  try {
    const p = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return p.role ?? null;
  } catch { return null; }
}

async function graphPost(path: string, params: Record<string, string>, pageToken: string) {
  const res = await fetch(`${GRAPH}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ ...params, access_token: pageToken }),
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error?.message ?? `Graph error ${res.status}`);
  return data;
}

async function graphGet(path: string, pageToken: string) {
  const res = await fetch(`${GRAPH}/${path}${path.includes("?") ? "&" : "?"}access_token=${pageToken}`);
  return await res.json();
}

// Wait until an Instagram media container is ready
async function waitForContainer(id: string, pageToken: string, tries: number, delayMs: number) {
  for (let i = 0; i < tries; i++) {
    const st = await graphGet(`${id}?fields=status_code,status`, pageToken);
    if (st.status_code === "FINISHED" || (!st.status_code && !st.error)) return;
    if (st.status_code === "ERROR" || st.status_code === "EXPIRED") {
      throw new Error(`Instagram could not process the media (${st.status ?? st.status_code})`);
    }
    await sleep(delayMs);
  }
  throw new Error("Instagram media processing timed out");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, serviceKey);
  const pageToken = Deno.env.get("META_PAGE_TOKEN");
  const pageId = Deno.env.get("META_PAGE_ID");
  const igId = Deno.env.get("META_IG_USER_ID");
  if (!pageToken || !pageId || !igId) return json({ error: "META_* secrets missing" }, 500);

  const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  const isService = token === serviceKey || jwtRole(token) === "service_role";

  let body: { content_id?: string };
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  if (!body.content_id) return json({ error: "content_id required" }, 400);

  const { data: post, error } = await admin
    .from("generated_content")
    .select("*")
    .eq("id", body.content_id)
    .single();
  if (error || !post) return json({ error: "Post not found", detail: error?.message }, 404);

  if (!isService) {
    const { data: shop } = await admin.from("shops").select("owner_id").eq("id", post.shop_id).single();
    const { data: u } = await admin.auth.getUser(token);
    if (!u?.user || !shop || u.user.id !== shop.owner_id) return json({ error: "Not allowed" }, 403);
  }
  if (!["approved", "publishing"].includes(post.status)) {
    return json({ error: `Post status is '${post.status}', must be 'approved'` }, 409);
  }
  if (!post.asset_path) return json({ error: "Post has no media yet" }, 409);

  await admin.from("generated_content").update({ status: "publishing" }).eq("id", post.id);

  const publicBase = `${url}/storage/v1/object/public/generated-content`;
  const mediaUrl = `${publicBase}/${post.asset_path}`;
  const isVideo = post.media_type === "video";
  // Several photos in one post = carousel (cover photo first)
  const photoUrls: string[] = isVideo ? [] : [post.asset_path, ...(post.extra_paths ?? [])].map((p: string) => `${publicBase}/${p}`);
  const isCarousel = photoUrls.length > 1;
  const caption = `${post.caption ?? ""}\n\n${(post.hashtags ?? []).join(" ")}`.trim();
  const platforms: string[] = post.platforms ?? [];
  const results: Record<string, { ok: boolean; id?: string; error?: string }> = {};

  if (platforms.includes("instagram")) {
    try {
      let creationId: string;
      if (isCarousel) {
        const children: string[] = [];
        for (const u of photoUrls.slice(0, 10)) {
          const child = await graphPost(`${igId}/media`, { image_url: u, is_carousel_item: "true" }, pageToken);
          await waitForContainer(child.id, pageToken, 10, 2000);
          children.push(child.id);
        }
        const parent = await graphPost(`${igId}/media`, { media_type: "CAROUSEL", children: children.join(","), caption }, pageToken);
        await waitForContainer(parent.id, pageToken, 10, 2000);
        creationId = parent.id;
      } else {
        const created = await graphPost(
          `${igId}/media`,
          isVideo
            ? { media_type: "REELS", video_url: mediaUrl, caption, share_to_feed: "true" }
            : { image_url: mediaUrl, caption },
          pageToken,
        );
        await waitForContainer(created.id, pageToken, isVideo ? 24 : 10, isVideo ? 4000 : 2000);
        creationId = created.id;
      }
      const pub = await graphPost(`${igId}/media_publish`, { creation_id: creationId }, pageToken);
      results.instagram = { ok: true, id: pub.id };
    } catch (e) { results.instagram = { ok: false, error: (e as Error).message }; }
  }

  if (platforms.includes("facebook")) {
    try {
      // META_PAGE_TOKEN may be a user token; exchange it for the page's own token
      let fbToken = pageToken;
      const pg = await graphGet(`${pageId}?fields=access_token`, pageToken);
      if (pg.access_token) fbToken = pg.access_token;
      let fb;
      if (isVideo) {
        fb = await graphPost(`${pageId}/videos`, { file_url: mediaUrl, description: caption }, fbToken);
      } else if (isCarousel) {
        const ids: string[] = [];
        for (const u of photoUrls.slice(0, 10)) {
          const ph = await graphPost(`${pageId}/photos`, { url: u, published: "false" }, fbToken);
          ids.push(ph.id);
        }
        fb = await graphPost(`${pageId}/feed`, { message: caption, attached_media: JSON.stringify(ids.map((id) => ({ media_fbid: id }))) }, fbToken);
      } else {
        fb = await graphPost(`${pageId}/photos`, { url: mediaUrl, caption }, fbToken);
      }
      results.facebook = { ok: true, id: fb.post_id ?? fb.id };
    } catch (e) { results.facebook = { ok: false, error: (e as Error).message }; }
  }

  const anyOk = Object.values(results).some((r) => r.ok);
  const errors = Object.entries(results).filter(([, r]) => !r.ok).map(([k, r]) => `${k}: ${r.error}`).join(" | ");
  await admin.from("generated_content").update(
    anyOk
      ? { status: "published", published_at: new Date().toISOString(), error_message: errors || null, publish_results: results }
      : { status: "failed", error_message: errors || "No platform selected", publish_results: results },
  ).eq("id", post.id);

  return json({ ok: anyOk, media_type: post.media_type, results }, anyOk ? 200 : 502);
});
