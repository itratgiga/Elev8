"""Local try-on API for Elev8, backed by SwayamInSync/clothes-virtual-try-on (VITON-HD style pipeline).

POST /api/tryon   multipart: person=<photo>, cloth=<garment photo>   ->  image/jpeg (person wearing the garment)
GET  /api/health  -> {"mode": "mock"|"real", "ready": bool, "detail": str}

VTON_MODE=mock (default) needs no GPU: it just pastes the garment on the person so the Elev8 UI can be tested.
VTON_MODE=real runs the original repo pipeline (CUDA GPU, OpenPose, Self-Correction-Human-Parsing and the
checkpoints are required, see README.md in this folder).
"""
import io
import os
import shutil
import subprocess
import sys
import tempfile
import threading
import time
from pathlib import Path

from flask import Flask, jsonify, request, send_file
from PIL import Image, ImageFilter

HERE = Path(__file__).resolve().parent
MODE = os.environ.get("VTON_MODE", "mock").lower()
REPO = Path(os.environ.get("VTON_REPO", HERE / "clothes-virtual-try-on")).resolve()
OPENPOSE = Path(os.environ.get("OPENPOSE_DIR", HERE / "openpose")).resolve()
SCHP = Path(os.environ.get("SCHP_DIR", HERE / "Self-Correction-Human-Parsing")).resolve()
W, H = 768, 1024  # size the model was trained on

app = Flask(__name__)
lock = threading.Lock()  # the GPU pipeline handles one request at a time


def real_missing():
    need = {
        "repo": REPO / "test.py",
        "checkpoints": REPO / "checkpoints" / "alias_final.pth",
        "cloth-mask weights": REPO / "cloth_segm_u2net_latest.pth",
        "openpose": OPENPOSE / "build" / "examples" / "openpose" / "openpose.bin",
        "human parsing": SCHP / "checkpoints" / "final.pth",
    }
    return [k for k, p in need.items() if not p.exists()]


def fit(img, size):
    """Resize keeping aspect ratio, pad with white (the model expects a plain background)."""
    img = img.convert("RGB")
    img.thumbnail(size)
    out = Image.new("RGB", size, (255, 255, 255))
    out.paste(img, ((size[0] - img.width) // 2, (size[1] - img.height) // 2))
    return out


def run_mock(person, cloth):
    time.sleep(1.5)
    base = fit(person, (W, H))
    c = cloth.convert("RGBA")
    bg = c.getpixel((0, 0))
    px = c.load()
    for y in range(c.height):  # crude white-background cutout, good enough for a UI test
        for x in range(c.width):
            r, g, b, _ = px[x, y]
            if abs(r - bg[0]) + abs(g - bg[1]) + abs(b - bg[2]) < 60:
                px[x, y] = (r, g, b, 0)
    c = c.crop(c.getbbox() or (0, 0, c.width, c.height))
    cw = int(W * 0.62)
    c = c.resize((cw, int(c.height * cw / c.width)))
    alpha = c.split()[3].filter(ImageFilter.GaussianBlur(1))
    c.putalpha(alpha.point(lambda a: int(a * 0.92)))
    base.paste(c, ((W - cw) // 2, int(H * 0.2)), c)
    return base


def run_real(person, cloth):
    miss = real_missing()
    if miss:
        raise RuntimeError("Real mode is not set up (missing: " + ", ".join(miss) + "). See vton-server/README.md")
    work = Path(tempfile.mkdtemp(prefix="vton-"))
    try:
        for d in ("cloth", "cloth-mask", "image", "image-parse", "openpose-img", "openpose-json"):
            (work / "inputs" / "test" / d).mkdir(parents=True)
        fit(cloth, (W, H)).save(work / "inputs/test/cloth/cloth.jpg")
        fit(person, (W, H)).save(work / "inputs/test/image/model.jpg")
        # The upstream scripts hardcode Colab's /content; point them at our folders.
        src = (REPO / "run.py").read_text()
        for a, b in [
            ("/content/clothes-virtual-try-on", str(REPO)),
            ("/content/Self-Correction-Human-Parsing", str(SCHP)),
            ("cd openpose &&", f"cd {OPENPOSE} &&"),
            ("/content/inputs", str(work / "inputs")),
            ("os.chdir('/content')", f"os.chdir('{work}')"),
            ("--save_dir /content/", f"--save_dir {work}/"),
            ("/content/output", str(work / "output")),
        ]:
            src = src.replace(a, b)
        # remove_bg.py / cloth-mask.py have the same hardcoded paths
        for name in ("remove_bg.py", "cloth-mask.py"):
            t = (REPO / name).read_text().replace("/content/inputs", str(work / "inputs"))
            (work / name).write_text(t)
        src = src.replace(f"{REPO}/remove_bg.py", str(work / "remove_bg.py")).replace('"python cloth-mask.py"', f'"python {work}/cloth-mask.py"')
        (work / "run_patched.py").write_text(src)
        r = subprocess.run([sys.executable, str(work / "run_patched.py")], cwd=REPO, capture_output=True, text=True, timeout=600)
        outs = sorted((work / "output").glob("*.jpg")) if (work / "output").exists() else []
        if not outs:
            raise RuntimeError("Pipeline produced no image.\n" + (r.stdout + r.stderr)[-1500:])
        return Image.open(outs[0]).convert("RGB")
    finally:
        shutil.rmtree(work, ignore_errors=True)


@app.get("/api/health")
def health():
    miss = real_missing() if MODE == "real" else []
    return jsonify(mode=MODE, ready=not miss, detail=("missing: " + ", ".join(miss)) if miss else "ok")


@app.post("/api/tryon")
def tryon():
    if "person" not in request.files or "cloth" not in request.files:
        return jsonify(error="Send both 'person' and 'cloth' images"), 400
    try:
        person = Image.open(request.files["person"].stream)
        cloth = Image.open(request.files["cloth"].stream)
    except Exception:
        return jsonify(error="Could not read the image"), 400
    with lock:
        try:
            out = (run_real if MODE == "real" else run_mock)(person, cloth)
        except Exception as e:  # surface setup problems to the UI
            app.logger.exception("try-on failed")
            return jsonify(error=str(e)[:600]), 500
    buf = io.BytesIO()
    out.save(buf, "JPEG", quality=92)
    buf.seek(0)
    return send_file(buf, mimetype="image/jpeg")


if __name__ == "__main__":
    print(f"[vton] mode={MODE}")
    app.run(host="127.0.0.1", port=int(os.environ.get("PORT", 8787)))
