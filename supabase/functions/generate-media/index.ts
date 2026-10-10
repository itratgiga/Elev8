import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const API = "https://generativelanguage.googleapis.com/v1beta";
const IMAGE_MODELS = ["gemini-3.1-flash-image", "gemini-3-pro-image-preview", "gemini-2.5-flash-image"];
const VIDEO_MODELS = ["veo-3.1-fast-generate-preview", "veo-3.1-generate-preview", "veo-3.0-fast-generate-001", "veo-2.0-generate-001"];

function makeTracer() {
  const t0 = Date.now();
  const steps: string[] = [];
  return { steps, log: (s: string) => steps.push(`${((Date.now() - t0) / 1000).toFixed(1)}s ${s}`) };
}
type Tracer = ReturnType<typeof makeTracer>;

function toB64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function fromB64(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}
function mimeFromPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase();
  return ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
}

const LOOKS: Record<string, string> = {
  studio: "clean professional studio with a soft neutral backdrop and softbox lighting",
  street: "stylish outdoor city street, natural golden-hour light, shallow depth of field",
  festive: "warm festive Indian setting with soft bokeh lights, celebratory mood",
  store: "bright modern boutique interior, premium retail feel",
};
const WHO: Record<string, string> = {
  female: "a female model",
  male: "a male model",
  auto: "a model who suits this product (choose the most natural fit for the product)",
};

function pickAngles(views: string[], want: number): string[] {
  const list = ["FRONT view: the model stands facing the camera, the front of the product fully visible"];
  if (views.includes("side")) list.push("SIDE profile view, matching the SIDE reference photo");
  if (views.includes("back")) list.push("BACK view, matching the BACK reference photo");
  list.push(
    "three-quarter FRONT angle, model turned slightly to the left, the front of the product still clearly visible",
    "three-quarter FRONT angle, model turned slightly to the right, the front of the product still clearly visible",
    "close-up of the product on the model's body, model facing the camera, front of the product visible",
    "relaxed lifestyle pose facing the camera, smiling, front of the product visible",
  );
  return list.slice(0, want);
}

async function modelPhoto(
  key: string,
  refs: { b64: string; mime: string; view: string }[],
  product: { name: string; category?: string | null; description?: string | null; colors?: string[] | null },
  who: string,
  look: string,
  ratio: string,
  angle: string,
  tr: Tracer,
) {
  const prompt =
    `Create a realistic, high-end fashion photoshoot photograph. ${WHO[who] ?? WHO.auto} is wearing or naturally using ` +
    `the exact product shown in the reference photo(s): ${product.name}${product.category ? ` (${product.category})` : ""}. ` +
    `Keep the product's real design, colour, pattern, fabric, print and details exactly as in the reference photos. ` +
    `Orientation rule: the model must wear the product the same way round as the references. If the reference is the FRONT, the model faces the camera so the front is visible; never show the model from behind unless the camera angle below says BACK view. ` +
    `Camera angle: ${angle}. Setting: ${LOOKS[look] ?? LOOKS.studio}. ` +
    `The product must be the clearly visible hero of the picture and the ONLY item of its kind: do not add other products or shoes unless that is the product. ` +
    `Photography style: editorial advertising campaign for a premium brand, shot on a full-frame camera with an 85mm f/1.8 lens, soft key light with a gentle rim light, shallow depth of field, ` +
    `attractive, aspirational and well composed, true-to-life product colours and fabric texture, flattering natural skin with realistic texture, subtle professional colour grading, crisp focus on the product. ` +
    `Correct anatomy, natural hands and face, no distortion. No text, no watermark, no added logos.`;
  const parts: unknown[] = [];
  refs.forEach((r, i) => {
    parts.push({ text: `Reference photo ${i + 1}: the ${r.view.toUpperCase()} of the product.` });
    parts.push({ inlineData: { mimeType: r.mime, data: r.b64 } });
  });
  parts.push({ text: prompt });
  let lastErr = "";
  for (const model of IMAGE_MODELS) {
    for (const withRatio of [true, false]) {
      try {
        tr.log(`photo: trying ${model}${withRatio ? "" : " (no ratio)"}`);
        const res = await fetch(`${API}/models/${model}:generateContent`, {
          method: "POST",
          headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts }],
            generationConfig: {
              responseModalities: ["IMAGE"],
              ...(withRatio ? { imageConfig: { aspectRatio: ratio } } : {}),
            },
          }),
          signal: AbortSignal.timeout(55000),
        });
        const text = await res.text();
        if (!res.ok) {
          lastErr = `${model} (${res.status}): ${text.slice(0, 240)}`;
          tr.log(lastErr.slice(0, 160));
          if (res.status === 400 && withRatio) continue; // retry without imageConfig
          break;
        }
        const data = JSON.parse(text);
        const ps = data.candidates?.[0]?.content?.parts ?? [];
        const part = ps.find((p: { inlineData?: unknown; inline_data?: unknown }) => p.inlineData || p.inline_data);
        const b64 = part?.inlineData?.data ?? part?.inline_data?.data;
        if (!b64) {
          lastErr = `${model}: no image returned (${(data.candidates?.[0]?.finishReason ?? data.promptFeedback?.blockReason ?? "unknown")})`;
          tr.log(lastErr);
          break;
        }
        tr.log(`photo: ok on ${model}`);
        return { bytes: fromB64(b64), mime: part?.inlineData?.mimeType ?? "image/png", model };
      } catch (e) {
        lastErr = `${model}: ${(e as Error).message}`;
        tr.log(lastErr);
        break;
      }
    }
  }
  throw new Error(`Photo generation failed. ${lastErr}`);
}

async function startVideo(key: string, photo: { bytes: Uint8Array; mime: string }, product: { name: string }, tr: Tracer) {
  const prompt =
    `Short vertical fashion reel. The model from the photo stays facing the camera and moves naturally and confidently: small shifts of weight, a gentle sway, slight head movement and a soft smile, ` +
    `showing off the ${product.name}. Smooth slow camera movement, cinematic soft lighting, premium social-media advert feel. No text.`;
  let lastErr = "";
  for (const model of VIDEO_MODELS) {
    try {
      tr.log(`video: trying ${model}`);
      const res = await fetch(`${API}/models/${model}:predictLongRunning`, {
        method: "POST",
        headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
        body: JSON.stringify({
          instances: [{ prompt, image: { bytesBase64Encoded: toB64(photo.bytes), mimeType: photo.mime } }],
          parameters: { aspectRatio: "9:16", durationSeconds: 8 },
        }),
        signal: AbortSignal.timeout(40000),
      });
      const text = await res.text();
      if (!res.ok) {
        lastErr = `${model} (${res.status}): ${text.slice(0, 240)}`;
        tr.log(lastErr.slice(0, 160));
        continue;
      }
      const op = JSON.parse(text).name as string;
      if (!op) { lastErr = `${model}: no operation name`; continue; }
      tr.log(`video: started ${model} -> ${op}`);
      return { op, model };
    } catch (e) {
      lastErr = `${model}: ${(e as Error).message}`;
      tr.log(lastErr);
    }
  }
  throw new Error(`Video start failed. ${lastErr}`);
}

async function captionFor(key: string, admin: ReturnType<typeof createClient>, product: Record<string, any>, isReel: boolean, ref: { b64: string; mime: string } | null, tr: Tracer) {
  const fallback = () => {
    const tag = (s: string) => "#" + s.replace(/[^\p{L}\p{N}]+/gu, "");
    const tags = [product.name, product.category ?? "", product.shops.name, "NewArrival", "ShopLocal", "Style"].filter(Boolean).map(tag).filter((t) => t.length > 1);
    const hi = ["hinglish", "hi"].includes(product.shops.default_language);
    return {
      caption: hi ? `${product.name} ab ${product.shops.name} me available hai! Aaj hi store visit karein.` : `${product.name} is now available at ${product.shops.name}! Visit our store today.`,
      hashtags: tags,
    };
  };
  const { data: tpl } = await admin.from("prompt_templates").select("*").eq("key", "social_post").single();
  const system = tpl?.system_prompt ?? "You write short, friendly social media captions for local shops.";
  const user =
    `Product: ${product.name}\nCategory: ${product.category ?? ""}\nPrice: ${product.currency} ${product.price ?? ""}\n` +
    `Description: ${product.description ?? ""}\nShop: ${product.shops.name}\nLanguage: ${product.shops.default_language}\n` +
    `Write ONE ${isReel ? "reel" : "photo"} caption for this exact product, shown on a model. Look at the attached product photo and describe only what is really visible (type of item, colour, print, style). Use the product name given. Do not invent brands, materials, offers or prices that are not stated above.`;
  const models = [...new Set([tpl?.gemini_model, "gemini-flash-latest", "gemini-3.5-flash", "gemini-2.5-flash-lite"].filter(Boolean))] as string[];
  for (const model of models) {
    try {
      tr.log(`caption: trying ${model}`);
      const res = await fetch(`${API}/models/${model}:generateContent`, {
        method: "POST",
        headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: ref ? [{ inlineData: { mimeType: ref.mime, data: ref.b64 } }, { text: user }] : [{ text: user }] }],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
              type: "OBJECT",
              required: ["caption", "hashtags"],
              properties: { caption: { type: "STRING" }, hashtags: { type: "ARRAY", items: { type: "STRING" } } },
            },
          },
        }),
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) { tr.log(`caption ${model} ${res.status}`); continue; }
      const d = await res.json();
      const out = JSON.parse(d.candidates[0].content.parts[0].text);
      if (out.caption) return { ...out, source: "ai" };
    } catch (e) {
      tr.log(`caption ${model}: ${(e as Error).message.slice(0, 100)}`);
    }
  }
  return { ...fallback(), source: "template" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const tr = makeTracer();
  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) return json({ error: "GEMINI_API_KEY is not set in Supabase secrets" }, 500);
  const admin = createClient(url, serviceKey);
  const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  const { data: u } = await admin.auth.getUser(token);
  if (!u?.user) return json({ error: "Please sign in again" }, 401);

  let body: { count?: number; action?: string; product_id?: string; content_id?: string; media?: string; who?: string; look?: string };
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  // ---------- CHECK a running reel ----------
  if (body.action === "check") {
    if (!body.content_id) return json({ error: "content_id required" }, 400);
    const { data: row } = await admin.from("generated_content").select("*").eq("id", body.content_id).single();
    if (!row) return json({ error: "Post not found" }, 404);
    const { data: shopRow } = await admin.from("shops").select("owner_id").eq("id", row.shop_id).single();
    if (!shopRow || shopRow.owner_id !== u.user.id) return json({ error: "Not allowed" }, 403);
    if (row.status !== "processing" || !row.video_job) return json({ ok: true, status: row.status });

    const res = await fetch(`${API}/${row.video_job}`, { headers: { "x-goog-api-key": key }, signal: AbortSignal.timeout(30000) });
    const text = await res.text();
    if (!res.ok) {
      tr.log(`poll ${res.status}`);
      return json({ ok: true, status: "processing", note: `poll ${res.status}: ${text.slice(0, 160)}`, trace: tr.steps });
    }
    const op = JSON.parse(text);
    if (!op.done) return json({ ok: true, status: "processing" });

    const fail = async (msg: string) => {
      await admin.from("generated_content").update({ status: "draft", video_job: null, error_message: `Reel failed, photo kept: ${msg}`.slice(0, 400) }).eq("id", row.id);
      return json({ ok: true, status: "failed", error: msg });
    };
    if (op.error) return fail(op.error.message ?? JSON.stringify(op.error).slice(0, 200));
    const gen = op.response?.generateVideoResponse;
    const uri = gen?.generatedSamples?.[0]?.video?.uri;
    if (!uri) return fail(`No video returned. ${JSON.stringify(gen?.raiMediaFilteredReasons ?? op.response ?? {}).slice(0, 200)}`);

    const dl = await fetch(uri, { headers: { "x-goog-api-key": key }, redirect: "follow", signal: AbortSignal.timeout(60000) });
    if (!dl.ok) return fail(`Could not download video (${dl.status})`);
    const bytes = new Uint8Array(await dl.arrayBuffer());
    const path = `${row.shop_id}/${crypto.randomUUID()}.mp4`;
    const { error: upErr } = await admin.storage.from("generated-content").upload(path, bytes, { contentType: "video/mp4", upsert: true });
    if (upErr) return fail(`Upload failed: ${upErr.message}`);
    await admin.from("generated_content").update({
      media_type: "video", kind: "post", source_image_path: row.asset_path, asset_path: path, status: "draft", video_job: null, error_message: null,
    }).eq("id", row.id);
    return json({ ok: true, status: "done", asset_path: path, bytes: bytes.length });
  }

  // ---------- CREATE photo / reel ----------
  if (!body.product_id) return json({ error: "product_id required" }, 400);
  const media = body.media === "reel" ? "reel" : "photo";
  const who = ["female", "male", "auto"].includes(body.who ?? "") ? body.who! : "auto";
  const look = body.look && LOOKS[body.look] ? body.look : "studio";

  const { data: product, error: pErr } = await admin
    .from("products").select("*, shops(id, owner_id, name, default_language)").eq("id", body.product_id).single();
  if (pErr || !product) return json({ error: "Product not found", detail: pErr?.message }, 404);
  if (product.shops.owner_id !== u.user.id) return json({ error: "Not allowed" }, 403);

  const { data: photos } = await admin.from("product_images").select("path, view, sort_order").eq("product_id", product.id).order("sort_order", { ascending: true });
  if (!photos?.length) return json({ error: "Add at least one photo to this product first. The AI needs it to dress the model." }, 400);
  const order = ["front", "side", "back", "detail"];
  const chosen = [...photos].sort((a, b) => order.indexOf(a.view) - order.indexOf(b.view)).slice(0, 4);
  const refs: { b64: string; mime: string; view: string }[] = [];
  for (const p of chosen) {
    const dl = await fetch(`${url}/storage/v1/object/public/product-images/${p.path}`);
    if (dl.ok) refs.push({ b64: toB64(new Uint8Array(await dl.arrayBuffer())), mime: mimeFromPath(p.path), view: p.view });
  }
  if (!refs.length) return json({ error: "Could not read the product photos" }, 500);
  tr.log(`using ${refs.length} product photo(s)`);

  const nViews = new Set(photos.map((p) => p.view)).size;
  const wantRaw = Number(body.count);
  const want = media === "reel" ? 1 : Math.min(5, Math.max(1, Number.isFinite(wantRaw) && wantRaw > 0 ? Math.round(wantRaw) : Math.max(3, nViews)));
  const ratio = media === "reel" ? "9:16" : "4:5";
  const angles = pickAngles(refs.map((r) => r.view), 5);
  const results = await Promise.allSettled(
    Array.from({ length: want }, (_, i) => modelPhoto(key, refs, product, who, look, ratio, angles[i % angles.length], tr)),
  );
  const photos_ok = results.filter((r) => r.status === "fulfilled").map((r) => (r as PromiseFulfilledResult<Awaited<ReturnType<typeof modelPhoto>>>).value);
  if (!photos_ok.length) {
    const why = (results[0] as PromiseRejectedResult).reason?.message ?? "unknown";
    return json({ error: why, trace: tr.steps }, 502);
  }
  const cap = await captionFor(key, admin, product, media === "reel", refs[0] ?? null, tr);
  let videoError: string | null = null;
  const paths: string[] = [];
  for (const photo of photos_ok) {
    const imgPath = `${product.shop_id}/${crypto.randomUUID()}.${photo.mime === "image/jpeg" ? "jpg" : "png"}`;
    const { error: upErr } = await admin.storage.from("generated-content").upload(imgPath, photo.bytes, { contentType: photo.mime, upsert: true });
    if (upErr) return json({ error: "Upload failed", detail: upErr.message, trace: tr.steps }, 500);
    paths.push(imgPath);
  }
  // One post. Photos go together as a carousel (first photo is the cover).
  const row: Record<string, unknown> = {
    shop_id: product.shop_id, product_id: product.id, kind: "post", media_type: "image",
    caption: cap.caption, hashtags: cap.hashtags, asset_path: paths[0], extra_paths: paths.slice(1),
    platforms: ["instagram", "facebook"], status: "draft", error_message: null,
  };
  if (media === "reel") {
    try {
      const v = await startVideo(key, { bytes: photos_ok[0].bytes, mime: photos_ok[0].mime }, product, tr);
      row.status = "processing";
      row.video_job = v.op;
      row.source_image_path = paths[0];
    } catch (e) {
      videoError = (e as Error).message;
      row.error_message = `Reel could not start, photo saved instead: ${videoError}`.slice(0, 400);
    }
  }
  const rows = [row];
  const { data: saved, error: sErr } = await admin.from("generated_content").insert(rows).select();
  if (sErr) return json({ error: "Save failed", detail: sErr.message, trace: tr.steps }, 500);

  return json({
    ok: true, media, photos_made: photos_ok.length, photos_asked: want, caption_source: cap.source,
    reel_started: media === "reel" && !videoError, video_error: videoError, drafts: saved, trace: tr.steps,
  });
});
