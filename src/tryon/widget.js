// Try-on window backed by the local clothes-virtual-try-on server (vton-server/).
//   idle     -> live camera + "Drag a product image here"
//   countdown-> "Stand straight, arms down" 3-2-1, then one photo of the customer is taken
//   busy     -> photo + garment are sent to the server, the result comes back as one image (10-60 s)
//   result   -> customer wearing the garment; picking another garment re-uses the same photo
import { CSS } from "./styles.js";

const ICONS = {
  expand: `<svg viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>`,
  share: `<svg viewBox="0 0 24 24"><path d="M21 3 10 14M21 3l-7 18-4-7-7-4z"/></svg>`,
  save: `<svg viewBox="0 0 24 24"><path d="M12 4v11M7 11l5 5 5-5M5 20h14"/></svg>`,
  camera: `<svg viewBox="0 0 24 24"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>`,
  image: `<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 17-5-5-9 8"/></svg>`,
};

export function mount(opts = {}) {
  const o = {
    brand: "Studio",
    apiUrl: "/api/tryon",       // POST multipart: person, cloth -> image/jpeg
    headers: {},
    position: { right: 24, top: 90 },
    container: null,            // element: render the mirror inline inside it instead of floating
    fullscreen: false,
    ...opts,
  };

  const host = document.createElement("div");
  host.id = "live-tryon-root";
  (o.container || document.body).appendChild(host);
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `<style>${CSS}</style>
  <section class="win" part="window" aria-label="Virtual try-on">
    <header class="bar">
      <span class="title">Try-On <i>✦</i> ${escapeHtml(o.brand)}</span>
      <button class="min" title="Minimize" aria-label="Minimize">–</button>
      <button class="close" title="Close" aria-label="Close try-on">Close ✕</button>
    </header>
    <div class="body">
      <video class="cam" autoplay playsinline muted></video>
      <img class="result" alt="Try-on result" hidden>
      <div class="count" hidden></div>
      <div class="tools" hidden>
        <button data-act="retake" title="Retake my photo">${ICONS.camera}</button>
        <button data-act="expand" title="Expand">${ICONS.expand}</button>
        <button data-act="share" title="Share">${ICONS.share}</button>
        <button data-act="save" title="Save photo">${ICONS.save}</button>
      </div>
      <div class="mark">${escapeHtml(o.brand)}</div>
      <div class="hint">${ICONS.image}<span>Drag a product image here</span></div>
      <div class="busy" hidden><div class="spin"></div><span></span></div>
      <div class="msg" hidden></div>
      <div class="drop" hidden><span>Drop to try it on</span></div>
      <input class="file" type="file" accept="image/*" hidden>
    </div>
  </section>`;

  const $ = (s) => root.querySelector(s);
  const win = $(".win"), body = $(".body"), cam = $(".cam"), result = $(".result");
  if (o.fullscreen) { win.classList.add("full"); win.style.display = "none"; }
  if (o.container) win.classList.add("inline");

  const state = { phase: "idle", camStream: null, person: null, resultUrl: null, jobId: 0, abort: null };

  function setPhase(p) {
    state.phase = p;
    win.dataset.phase = p;
    $(".hint").hidden = p !== "idle";
    $(".tools").hidden = p !== "result";
    result.hidden = p !== "result";
    if (p !== "countdown") $(".count").hidden = true;
  }
  function busy(text) { $(".busy").hidden = !text; $(".busy span").textContent = text || ""; }
  let msgTimer = 0;
  function toast(text, ms = 4500) {
    const m = $(".msg"); m.textContent = text; m.hidden = false;
    clearTimeout(msgTimer); msgTimer = setTimeout(() => (m.hidden = true), ms);
  }

  async function startCamera() {
    if (state.camStream) return state.camStream;
    try {
      state.camStream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 960 } } });
      cam.srcObject = state.camStream;
      await cam.play().catch(() => {});
      return state.camStream;
    } catch (e) {
      toast("Please allow the camera in your browser.", 6000);
      throw e;
    }
  }

  // One un-mirrored JPEG of whatever the camera sees.
  function grabPerson() {
    const c = document.createElement("canvas");
    c.width = cam.videoWidth; c.height = cam.videoHeight;
    c.getContext("2d").drawImage(cam, 0, 0);
    return new Promise((res) => c.toBlob(res, "image/jpeg", 0.92));
  }

  async function countdown(job) {
    setPhase("countdown");
    const el = $(".count"); el.hidden = false;
    for (let n = 3; n > 0; n--) {
      el.textContent = n === 3 ? "Stand straight, arms down… 3" : String(n);
      await new Promise((r) => setTimeout(r, 1000));
      if (job !== state.jobId) return null;
    }
    el.hidden = true;
    return grabPerson();
  }

  async function garmentBlob(source) {
    if (source.file) return source.file;
    const r = await fetch(source.url);
    if (!r.ok) throw new Error("Could not load the product image");
    return r.blob();
  }

  async function tryOn(source) {
    const job = ++state.jobId;
    state.abort?.abort();
    try {
      if (o.fullscreen) showFull();
      await startCamera();
      const cloth = await garmentBlob(source);
      if (!state.person) {
        state.person = await countdown(job);
        if (!state.person || job !== state.jobId) return;
      }
      busy("Dressing you up… this can take up to a minute");
      const fd = new FormData();
      fd.append("person", state.person, "person.jpg");
      fd.append("cloth", cloth, "cloth.jpg");
      state.abort = new AbortController();
      const r = await fetch(o.apiUrl, { method: "POST", headers: { ...o.headers }, body: fd, signal: state.abort.signal });
      if (!r.ok) {
        let msg = "Try-on failed";
        try { msg = (await r.json()).error || msg; } catch {}
        throw new Error(msg);
      }
      const blob = await r.blob();
      if (job !== state.jobId) return;
      if (state.resultUrl) URL.revokeObjectURL(state.resultUrl);
      state.resultUrl = URL.createObjectURL(blob);
      result.src = state.resultUrl;
      busy(null);
      setPhase("result");
    } catch (e) {
      if (e.name === "AbortError") return;
      console.error("[tryon]", e);
      busy(null);
      if (job === state.jobId) setPhase(state.resultUrl ? "result" : "idle");
      toast(e.message === "Failed to fetch" ? "Try-on server is not running. Start it with: npm run vton" : e.message || "Try-on failed");
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

  let dragDepth = 0;
  const showDrop = (on) => { $(".drop").hidden = !on; win.classList.toggle("dragging", on); };
  document.addEventListener("dragenter", () => { dragDepth++; showDrop(true); });
  document.addEventListener("dragleave", () => { if (--dragDepth <= 0) { dragDepth = 0; showDrop(false); } });
  document.addEventListener("drop", () => { dragDepth = 0; showDrop(false); });
  body.addEventListener("dragover", (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; });
  body.addEventListener("drop", (e) => {
    e.preventDefault(); dragDepth = 0; showDrop(false);
    const src = sourceFromDrop(e.dataTransfer);
    if (src) tryOn(src); else toast("Drop a product image here");
  });
  document.addEventListener("paste", (e) => {
    const src = e.clipboardData && sourceFromDrop(e.clipboardData);
    if (src) tryOn(src);
  });
  $(".hint").addEventListener("click", () => $(".file").click());
  $(".file").addEventListener("change", (e) => { const f = e.target.files[0]; if (f) tryOn({ file: f }); e.target.value = ""; });

  if (!o.container) { win.style.right = `${o.position.right}px`; win.style.top = `${o.position.top}px`; }
  $(".min").addEventListener("click", () => win.classList.toggle("collapsed"));
  if (!o.container) dragWindow(win, $(".bar"));

  $(".tools").addEventListener("click", (e) => {
    const act = e.target.closest("button")?.dataset.act;
    if (act === "expand") win.classList.toggle("big");
    if (act === "retake") { state.person = null; reset(); toast("Pick a garment to take a new photo"); }
    if (act === "save" && state.resultUrl) { const a = document.createElement("a"); a.href = state.resultUrl; a.download = `try-on-${Date.now()}.jpg`; a.click(); }
    if (act === "share") shareShot();
  });
  async function shareShot() {
    if (!state.resultUrl) return;
    const blob = await (await fetch(state.resultUrl)).blob();
    const file = new File([blob], "my-try-on.jpg", { type: "image/jpeg" });
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: "My try-on" }); return; } catch {}
    }
    const a = document.createElement("a"); a.href = state.resultUrl; a.download = "my-try-on.jpg"; a.click();
  }

  function reset() { state.jobId++; state.abort?.abort(); busy(null); setPhase("idle"); }
  function showFull() { win.style.display = ""; win.classList.remove("collapsed"); }
  function stopCam() { state.camStream?.getTracks().forEach((t) => t.stop()); state.camStream = null; cam.srcObject = null; }
  function closeFull() { reset(); state.person = null; stopCam(); win.style.display = "none"; }
  $(".close").addEventListener("click", closeFull);
  document.addEventListener("keydown", (e) => { if (o.fullscreen && e.key === "Escape" && win.style.display !== "none") closeFull(); });

  setPhase("idle");
  if (!o.fullscreen) startCamera().catch(() => {});

  return {
    tryOn: (urlOrFile) => tryOn(urlOrFile instanceof File ? { file: urlOrFile } : { url: new URL(urlOrFile, location.href).href }),
    stop: reset,
    open: () => (o.fullscreen ? showFull() : win.classList.remove("collapsed")),
    close: closeFull,
    destroy: () => { reset(); stopCam(); if (state.resultUrl) URL.revokeObjectURL(state.resultUrl); host.remove(); },
  };
}

// ---------- utils ----------
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
