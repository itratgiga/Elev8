// Floating live try-on window (same flow as the Anywear extension):
//   idle      -> live camera + "Drag a product image here"
//   framing   -> dark guide with the garment as the body and your face in a circle, "Step back"
//   queue     -> "You're #N in line" while Decart has no free GPU
//   live      -> Decart lucy-vton output, countdown badge, expand / share / save buttons
// Dropping another image while live swaps the garment without reconnecting.
import { createDecartClient, models } from "@decartai/sdk";
import { CSS } from "./styles.js";

const POSE_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";
const POSE_MODEL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";
const FALLBACK_PROMPT = "Substitute the current top with the garment shown in the reference image, keeping its exact color, pattern, fabric texture, collar and fit";

const ICONS = {
  expand: `<svg viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>`,
  share: `<svg viewBox="0 0 24 24"><path d="M21 3 10 14M21 3l-7 18-4-7-7-4z"/></svg>`,
  heart: `<svg viewBox="0 0 24 24"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>`,
  camera: `<svg viewBox="0 0 24 24"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>`,
  image: `<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 17-5-5-9 8"/></svg>`,
};

const fmt = (s) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.max(0, Math.floor(s)) % 60).padStart(2, "0")}`;

export function mount(opts = {}) {
  const o = {
    brand: "Studio",
    tokenUrl: "/api/tokens",
    garmentUrl: "/api/garment",
    headers: {},                // extra headers for tokenUrl/garmentUrl calls (e.g. Supabase anon key)
    secondsPerQueueSlot: 30,
    onSkipQueue: null,          // (position) => void ; shows the "faster queue" button when set
    onFavorite: null,           // ({image, garment}) => void
    position: { right: 24, top: 90 },
    container: null,            // element: render the mirror inline inside it instead of floating
    fullscreen: false,          // true: mirror covers the whole screen, opens on tryOn, closes with the Close button
    ...opts,
  };

  const host = document.createElement("div");
  host.id = "live-tryon-root";
  (o.container || document.body).appendChild(host);
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `<style>${CSS}</style>
  <section class="win" part="window" aria-label="Live try-on">
    <header class="bar">
      <span class="title">Try-On <i>✦</i> ${escapeHtml(o.brand)}</span>
      <button class="min" title="Minimize" aria-label="Minimize">–</button>
      <button class="close" title="Close" aria-label="Close try-on">Close ✕</button>
    </header>
    <div class="body">
      <video class="cam" autoplay playsinline muted></video>
      <video class="ai" autoplay playsinline muted></video>
      <canvas class="guide"></canvas>
      <div class="timer" hidden>0:00</div>
      <div class="tools" hidden>
        <button data-act="snap" title="Take photo">${ICONS.camera}</button>
        <button data-act="expand" title="Expand">${ICONS.expand}</button>
        <button data-act="share" title="Share">${ICONS.share}</button>
        <button data-act="fav" title="Save">${ICONS.heart}</button>
      </div>
      <div class="mark">${escapeHtml(o.brand)}</div>
      <div class="hint">${ICONS.image}<span>Drag a product image here</span></div>
      <div class="step" hidden>Step back</div>
      <div class="busy" hidden><div class="spin"></div><span></span></div>
      <div class="queue" hidden>
        <div class="card">
          <div class="spin dark"></div>
          <div class="tag">QUEUE</div>
          <div class="pos">You're #1 in line</div>
          <div class="eta">Estimated wait 0:30</div>
          <div class="fast" hidden>A faster queue is available</div>
          <button class="skip" hidden>SKIP THE WAIT</button>
        </div>
      </div>
      <div class="flash" hidden></div>
      <div class="preview" hidden>
        <img alt="Your try-on photo">
        <div class="pbtns"><button data-p="save">Save photo</button><button data-p="share">Share</button><button data-p="close">Keep trying</button></div>
      </div>
      <div class="msg" hidden></div>
      <div class="drop" hidden><span>Drop to try it on</span></div>
      <input class="file" type="file" accept="image/*" hidden>
    </div>
  </section>`;

  const $ = (s) => root.querySelector(s);
  const win = $(".win"), body = $(".body"), cam = $(".cam"), ai = $(".ai"), guide = $(".guide");
  const gctx = guide.getContext("2d");
  if (o.fullscreen) { win.classList.add("full"); win.style.display = "none"; }
  if (o.container) win.classList.add("inline");

  const state = {
    phase: "idle", camStream: null, rt: null, token: null, garmentImg: null, garmentSrc: null,
    pose: null, poseReady: false, readySince: 0, lastPose: null, live: false, tick: 0, raf: 0, jobId: 0,
  };

  // ---------- phase / UI ----------
  function setPhase(p) {
    state.phase = p;
    win.dataset.phase = p;
    $(".hint").hidden = p !== "idle";
    $(".step").hidden = p !== "framing";
    $(".queue").hidden = p !== "queue";
    $(".timer").hidden = $(".tools").hidden = p !== "live";
    guide.hidden = !(p === "framing" || p === "queue");
  }
  function busy(text) { $(".busy").hidden = !text; $(".busy span").textContent = text || ""; }
  let msgTimer = 0;
  function toast(text, ms = 3500) {
    const m = $(".msg"); m.textContent = text; m.hidden = false;
    clearTimeout(msgTimer); msgTimer = setTimeout(() => (m.hidden = true), ms);
  }

  // ---------- camera ----------
  const model = models.realtime("lucy-vton-latest");
  async function startCamera() {
    if (state.camStream) return state.camStream;
    try {
      state.camStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: "user", width: { ideal: model.width }, height: { ideal: model.height }, frameRate: model.fps },
      });
      cam.srcObject = state.camStream;
      await cam.play().catch(() => {});
      return state.camStream;
    } catch (e) {
      toast("Camera permission chahiye — browser me allow karo.", 6000);
      throw e;
    }
  }

  function frameFromCamera(max = 320) {
    if (!cam.videoWidth) return null;
    const k = max / Math.max(cam.videoWidth, cam.videoHeight);
    const c = document.createElement("canvas");
    c.width = Math.round(cam.videoWidth * k); c.height = Math.round(cam.videoHeight * k);
    c.getContext("2d").drawImage(cam, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.7);
  }

  // ---------- pose (for "Step back") ----------
  async function loadPose() {
    if (state.pose !== null) return state.pose;
    try {
      const url = `${POSE_URL}/vision_bundle.mjs`;
      const vision = await import(/* @vite-ignore */ url);
      const fileset = await vision.FilesetResolver.forVisionTasks(`${POSE_URL}/wasm`);
      state.pose = await vision.PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: POSE_MODEL, delegate: "GPU" },
        runningMode: "VIDEO", numPoses: 1,
      });
    } catch (e) {
      console.warn("[tryon] pose model unavailable, skipping framing check", e);
      state.pose = false;
    }
    return state.pose;
  }

  // Full upper body must be in frame: shoulders + hips visible, shoulders not too wide.
  // Returns "ok" when face + both shoulders + upper chest are in frame and the person is not too close.
  // Hips are NOT required: on a laptop camera they are usually below the frame.
  function checkFraming() {
    if (state.pose === null) return "loading";
    if (!state.pose || !cam.videoWidth) return "ok";
    let lm;
    try { lm = state.pose.detectForVideo(cam, performance.now()).landmarks?.[0]; }
    catch (e) { console.warn("[tryon] pose detect failed", e); return "ok"; }
    state.lastPose = lm || null;
    if (!lm) return "noperson";
    // some MediaPipe builds report visibility as 0/undefined; fall back to "inside the frame"
    const seen = (i) => {
      const p = lm[i], v = p.visibility;
      const inFrame = p.x > 0.01 && p.x < 0.99 && p.y > 0.01 && p.y < 0.99;
      return v ? v > 0.4 && inFrame : inFrame;
    };
    if (![0, 11, 12].every(seen)) return "close";
    const shoulderW = Math.abs(lm[11].x - lm[12].x);
    const chestY = (lm[11].y + lm[12].y) / 2 + shoulderW * 0.6;   // roughly mid-chest
    if (shoulderW > 0.55 || chestY > 0.97) return "close";
    return "ok";
  }

  // Dark guide: garment as the body, live face in a circle (exactly like the reference video).
  function drawGuide() {
    const W = (guide.width = body.clientWidth * devicePixelRatio);
    const H = (guide.height = body.clientHeight * devicePixelRatio);
    const g = gctx;
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#1a1a1a"); bg.addColorStop(1, "#050505");
    g.fillStyle = bg; g.fillRect(0, 0, W, H);

    const headR = H * 0.13, headX = W / 2, headY = H * 0.2;
    if (state.garmentImg) {
      const img = state.garmentImg;
      const gh = H * 0.68, gw = Math.min(W * 0.8, gh * (img.width / img.height));
      g.save();
      g.globalAlpha = 0.95;
      g.drawImage(img, headX - gw / 2, headY + headR * 0.9, gw, gw * (img.height / img.width));
      g.restore();
    }
    // face circle from the camera (mirrored)
    g.save();
    g.beginPath(); g.arc(headX, headY, headR, 0, Math.PI * 2); g.closePath();
    g.fillStyle = "#ddd"; g.fill(); g.clip();
    if (cam.videoWidth) {
      const lm = state.lastPose;
      const nx = lm ? lm[0].x : 0.5, ny = lm ? lm[0].y : 0.35;
      const span = lm ? Math.max(0.12, Math.abs(lm[7].x - lm[8].x) * 1.9) : 0.3;
      const sw = cam.videoWidth * span, sh = sw;
      const sx = cam.videoWidth * nx - sw / 2, sy = cam.videoHeight * ny - sh / 2;
      g.translate(headX * 2, 0); g.scale(-1, 1);
      g.drawImage(cam, sx, sy, sw, sh, headX - headR, headY - headR, headR * 2, headR * 2);
    }
    g.restore();
    g.lineWidth = 3 * devicePixelRatio; g.strokeStyle = "rgba(255,255,255,.85)";
    g.beginPath(); g.arc(headX, headY, headR, 0, Math.PI * 2); g.stroke();
  }

  function loop() {
    cancelAnimationFrame(state.raf);
    const step = () => {
      if (state.phase === "framing" || state.phase === "queue") {
        const f = checkFraming();
        const ok = f === "ok";
        if (ok) { if (!state.readySince) state.readySince = performance.now(); }
        else state.readySince = 0;
        // Never get stuck: once the AI stream is ready, go live after 4s even if framing is imperfect.
        if (state.live && !state.liveSince) state.liveSince = performance.now();
        const waitedTooLong = state.liveSince && performance.now() - state.liveSince > 4000;
        state.poseReady = (ok && performance.now() - state.readySince > 500) || waitedTooLong;
        const waited = Math.floor((performance.now() - (state.framingStart || performance.now())) / 1000);
        $(".step").textContent = state.live ? "Starting…" : state.phase === "queue" ? "Waiting in line…" : `Connecting to the try-on server… ${waited}s`;
        if (!state.live && waited > 40) { console.warn("[tryon] timeout waiting for generating state", state.connState); endSession("Try-on server did not respond. Check Decart credits or try again."); return; }
        drawGuide();
        maybeGoLive();
      } else if (state.phase === "live" && performance.now() - (state.hintAt || 0) > 250) {
        // while live, nudge the customer if they are too close / out of frame
        state.hintAt = performance.now();
        const f = checkFraming(), hint = $(".step");
        hint.hidden = f === "ok" || f === "loading";
        if (!hint.hidden) hint.textContent = f === "noperson" ? "Step in front of the camera" : "Step back a little so your upper body fits";
      }
      state.raf = requestAnimationFrame(step);
    };
    step();
  }

  function maybeGoLive() {
    if (state.phase === "framing" && state.live) { setPhase("live"); state.hintAt = 0; }
  }

  // ---------- Decart realtime ----------
  async function connect(garmentBlob, prompt) {
    const r = await fetch(o.tokenUrl, { method: "POST", headers: { ...o.headers } });
    const tok = await r.json();
    if (!r.ok) throw new Error(tok.error || "Token request failed");
    state.token = tok;
    $(".timer").textContent = fmt(tok.sessionSeconds || 60);

    const client = createDecartClient({ apiKey: tok.apiKey });
    const rt = await client.realtime.connect(state.camStream, {
      model: models.realtime(tok.model || "lucy-vton-latest"),
      onRemoteStream: (s) => { ai.srcObject = s; ai.play().catch(() => {}); },
      onQueuePosition: ({ position, queueSize }) => showQueue(position, queueSize),
      initialState: { image: garmentBlob, prompt: { text: prompt || FALLBACK_PROMPT, enhance: !prompt } },
    });
    state.rt = rt;
    rt.on("connectionChange", (s) => {
      state.connState = s; console.log("[tryon] connection:", s);
      if (s === "generating") {
        state.live = true;
        if (state.phase === "queue") setPhase("framing");
        maybeGoLive();
      } else if (s === "disconnected") endSession("Session khatam");
      else if (s === "reconnecting") toast("Reconnecting…");
    });
    rt.on("generationTick", ({ seconds }) => {
      state.tick = seconds;
      $(".timer").textContent = fmt((state.token?.sessionSeconds || 60) - seconds);
    });
    rt.on("generationEnded", ({ reason }) => endSession(reasonText(reason)));
    rt.on("sessionEnded", ({ reason }) => endSession(reasonText(reason)));
    rt.on("error", (e) => { console.error("[tryon]", e); toast(e.message || "Connection error"); });
    if (rt.getConnectionState?.() === "generating") { state.live = true; maybeGoLive(); }
  }

  function reasonText(r) {
    return ({
      insufficient_credits: "Decart credits khatam ho gaye",
      moderation_violation: "Ye image allowed nahi hai",
      session_limit: "Abhi bahut log try kar rahe hain, thodi der me try karo",
    })[r] || "Session khatam — dusra product drag karo";
  }

  function showQueue(position, queueSize) {
    if (state.live) return;
    setPhase("queue");
    $(".pos").textContent = `You're #${position} in line`;
    $(".eta").textContent = `Estimated wait ${fmt(position * o.secondsPerQueueSlot)}`;
    const canSkip = typeof o.onSkipQueue === "function";
    $(".fast").hidden = $(".skip").hidden = !canSkip;
    $(".skip").onclick = () => o.onSkipQueue(position, queueSize);
  }

  function endSession(text) {
    if (state.phase === "idle" && !state.rt) return;
    try { state.rt?.disconnect(); } catch {}
    state.rt = null; state.live = false; state.liveSince = 0; state.readySince = 0; state.poseReady = false;
    ai.srcObject = null;
    win.classList.remove("big");
    setPhase("idle");
    if (text) toast(text);
  }

  // ---------- garment intake ----------
  async function blobFromFile(file, max = 1024) {
    const img = await loadImage(URL.createObjectURL(file));
    return canvasJpeg(img, max);
  }
  function canvasJpeg(img, max = 1024) {
    const k = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    const x = c.getContext("2d");
    x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height);
    x.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.88);
  }

  async function tryOn(source) {
    const job = ++state.jobId;
    try {
      if (o.fullscreen) showFull();
      await startCamera();
      busy("Kapda ready ho raha hai…");
      const payload = { person: frameFromCamera() };
      if (source.file) payload.image = await blobFromFile(source.file);
      else if (new URL(source.url).origin === location.origin) payload.image = canvasJpeg(await loadImage(source.url));
      else payload.url = source.url;
      const r = await fetch(o.garmentUrl, { method: "POST", headers: { "Content-Type": "application/json", ...o.headers }, body: JSON.stringify(payload) });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Image load nahi hui");
      if (job !== state.jobId) return;

      state.garmentSrc = data.image;
      state.garmentImg = cutoutBackground(await loadImage(data.image));
      const blob = await (await fetch(data.image)).blob();
      busy(null);

      if (state.rt) {                       // already live: swap garment, no reconnect
        busy("Switching…");
        await state.rt.setImage(blob, { prompt: data.prompt || FALLBACK_PROMPT, enhance: !data.prompt });
        busy(null);
        return;
      }
      setPhase("framing");
      state.framingStart = performance.now();
      loadPose();
      loop();
      await connect(blob, data.prompt);
    } catch (e) {
      console.error("[tryon]", e);
      busy(null);
      if (job === state.jobId) endSession(null);
      toast(e.message || "Try-on start nahi hua");
      if (o.fullscreen && !state.camStream) setTimeout(closeFull, 3500);
    }
  }

  function sourceFromDrop(dt) {
    const file = [...(dt.files || [])].find((f) => f.type.startsWith("image/"));
    if (file) return { file };
    const uri = (dt.getData("text/uri-list") || "").split(String.fromCharCode(10)).find((l) => l && !l.startsWith("#"));
    const html = dt.getData("text/html");
    const src = html && new DOMParser().parseFromString(html, "text/html").querySelector("img")?.getAttribute("src");
    const url = src || uri || dt.getData("text/plain");
    if (url && /^(https?:|data:image[/])/.test(url.trim())) {
      const abs = new URL(url.trim().replace(/&amp;/g, "&"), location.href).href;
      return abs.startsWith("data:") ? { file: dataUriToFile(abs) } : { url: abs };
    }
    return null;
  }

  // ---------- drag & drop / paste / click ----------
  let dragDepth = 0;
  const showDrop = (on) => { $(".drop").hidden = !on; win.classList.toggle("dragging", on); };
  document.addEventListener("dragenter", () => { dragDepth++; showDrop(true); });
  document.addEventListener("dragleave", () => { if (--dragDepth <= 0) { dragDepth = 0; showDrop(false); } });
  document.addEventListener("drop", () => { dragDepth = 0; showDrop(false); });
  body.addEventListener("dragover", (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; });
  body.addEventListener("drop", (e) => {
    e.preventDefault(); dragDepth = 0; showDrop(false);
    const src = sourceFromDrop(e.dataTransfer);
    if (src) tryOn(src); else toast("Yahan sirf product image drop karo");
  });
  document.addEventListener("paste", (e) => {
    const src = e.clipboardData && sourceFromDrop(e.clipboardData);
    if (src) tryOn(src);
  });
  $(".hint").addEventListener("click", () => $(".file").click());
  $(".file").addEventListener("change", (e) => { const f = e.target.files[0]; if (f) tryOn({ file: f }); e.target.value = ""; });

  // ---------- window chrome ----------
  if (!o.container) { win.style.right = `${o.position.right}px`; win.style.top = `${o.position.top}px`; }
  $(".min").addEventListener("click", () => win.classList.toggle("collapsed"));
  if (!o.container) dragWindow(win, $(".bar"));

  $(".tools").addEventListener("click", async (e) => {
    const act = e.target.closest("button")?.dataset.act;
    if (act === "expand") win.classList.toggle("big");
    if (act === "snap") snapPhoto();
    if (act === "share") shareShot();
    if (act === "fav") {
      const shot = snapshot();
      e.target.closest("button").classList.add("on");
      try {
        const favs = JSON.parse(localStorage.getItem("tryon:favorites") || "[]");
        favs.unshift({ at: Date.now(), garment: state.garmentSrc?.slice(0, 200000), image: shot });
        localStorage.setItem("tryon:favorites", JSON.stringify(favs.slice(0, 12)));
      } catch {}
      o.onFavorite?.({ image: shot, garment: state.garmentSrc });
      toast("Saved ♥");
    }
  });

  function snapPhoto() {
    const url = snapshot();
    const fl = $(".flash"); fl.hidden = false; setTimeout(() => (fl.hidden = true), 160);
    const pv = $(".preview"); pv.querySelector("img").src = url; pv.dataset.url = url; pv.hidden = false;
  }
  $(".preview").addEventListener("click", (e) => {
    const act = e.target.closest("button")?.dataset.p; if (!act) return;
    const pv = $(".preview"), url = pv.dataset.url;
    if (act === "save") { const a = document.createElement("a"); a.href = url; a.download = `try-on-${Date.now()}.jpg`; a.click(); toast("Photo saved"); }
    if (act === "share") shareShot(url);
    if (act === "close") pv.hidden = true;
  });
  function snapshot() {
    const c = document.createElement("canvas");
    c.width = ai.videoWidth || 1280; c.height = ai.videoHeight || 720;
    const x = c.getContext("2d");
    x.translate(c.width, 0); x.scale(-1, 1);
    x.drawImage(ai, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.9);
  }
  async function shareShot(given) {
    const url = typeof given === "string" ? given : snapshot();
    const file = dataUriToFile(url, "my-try-on.jpg");
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: "My try-on" }); return; } catch {}
    }
    const a = document.createElement("a"); a.href = url; a.download = "my-try-on.jpg"; a.click();
  }

  function showFull() { win.style.display = ""; win.classList.remove("collapsed"); }
  function closeFull() {
    endSession(null);
    state.camStream?.getTracks().forEach((t) => t.stop());
    state.camStream = null; cam.srcObject = null;
    win.style.display = "none";
  }
  $(".close").addEventListener("click", closeFull);
  document.addEventListener("keydown", (e) => { if (o.fullscreen && e.key === "Escape" && win.style.display !== "none") closeFull(); });

  setPhase("idle");
  if (!o.fullscreen) startCamera().catch(() => {});

  return {
    tryOn: (urlOrFile) => tryOn(urlOrFile instanceof File ? { file: urlOrFile } : { url: new URL(urlOrFile, location.href).href }),
    stop: () => endSession(null),
    open: () => (o.fullscreen ? showFull() : win.classList.remove("collapsed")),
    close: closeFull,
    destroy: () => { endSession(null); state.camStream?.getTracks().forEach((t) => t.stop()); host.remove(); },
  };
}

// ---------- utils ----------
// Flood-fill the plain studio background from the borders so the guide shows only the garment silhouette.
function cutoutBackground(img, max = 600) {
  const k = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  const w = (c.width = Math.round(img.width * k)), h = (c.height = Math.round(img.height * k));
  const x = c.getContext("2d", { willReadFrequently: true });
  x.drawImage(img, 0, 0, w, h);
  const d = x.getImageData(0, 0, w, h), px = d.data;
  const bg = [0, 1, 2].map((ch) => (px[ch] + px[(w - 1) * 4 + ch] + px[(h - 1) * w * 4 + ch] + px[(w * h - 1) * 4 + ch]) / 4);
  const near = (o) => Math.hypot(px[o] - bg[0], px[o + 1] - bg[1], px[o + 2] - bg[2]) < 40;
  const seen = new Uint8Array(w * h), stack = [];
  for (let i = 0; i < w; i++) stack.push(i, (h - 1) * w + i);
  for (let j = 0; j < h; j++) stack.push(j * w, j * w + w - 1);
  while (stack.length) {
    const i = stack.pop();
    if (seen[i]) continue;
    seen[i] = 1;
    if (!near(i * 4)) continue;
    px[i * 4 + 3] = 0;
    const cx = i % w;
    if (cx > 0) stack.push(i - 1);
    if (cx < w - 1) stack.push(i + 1);
    if (i >= w) stack.push(i - w);
    if (i < w * (h - 1)) stack.push(i + w);
  }
  x.putImageData(d, 0, 0);
  return c;
}

function loadImage(src) {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("Image load nahi hui")); i.src = src; });
}
function dataUriToFile(uri, name = "garment.jpg") {
  const [head, b64] = uri.split(",");
  const mime = head.match(/data:([^;]+)/)[1];
  const bin = atob(b64), arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new File([arr], name, { type: mime });
}
function escapeHtml(s) { const d = document.createElement("div"); d.textContent = String(s); return d.innerHTML; }
function dragWindow(win, handle) {
  let sx, sy, ox, oy;
  handle.addEventListener("pointerdown", (e) => {
    if (e.target.closest("button")) return;
    const r = win.getBoundingClientRect();
    sx = e.clientX; sy = e.clientY; ox = r.left; oy = r.top;
    handle.setPointerCapture(e.pointerId);
  });
  handle.addEventListener("pointermove", (e) => {
    if (sx == null) return;
    const x = Math.min(innerWidth - 80, Math.max(0, ox + e.clientX - sx));
    const y = Math.min(innerHeight - 40, Math.max(0, oy + e.clientY - sy));
    Object.assign(win.style, { left: `${x}px`, top: `${y}px`, right: "auto" });
  });
  handle.addEventListener("pointerup", () => { sx = null; });
}
