"""HTTP API for the photo try-on model. Run it on the GPU machine (Colab or a hosted GPU).

Same pipeline as the notebook server: it drops the two images where run.py expects them,
runs run.py and returns the result PNG. Elev8's Try-on page calls POST /api/transform.

    pip install flask flask-cors pyngrok
    python server.py            # listens on :5000; set NGROK_AUTHTOKEN to get a public URL
"""
import io
import os
import shutil

from flask import Flask, jsonify, request, send_file
from flask_cors import CORS
from PIL import Image

ROOT = os.environ.get("TRYON_ROOT", "/content")
INPUTS = f"{ROOT}/inputs/test"
OUTPUT = f"{ROOT}/output"

app = Flask(__name__)
CORS(app)


def reset_dirs():
    shutil.rmtree(f"{ROOT}/inputs", ignore_errors=True)
    shutil.rmtree(OUTPUT, ignore_errors=True)
    for d in ("cloth", "cloth-mask", "image", "image-parse", "openpose-img", "openpose-json"):
        os.makedirs(f"{INPUTS}/{d}", exist_ok=True)


@app.get("/")
def health():
    return jsonify(status="ok")


@app.post("/api/transform")
def transform():
    if "cloth" not in request.files or "model" not in request.files:
        return jsonify(error="send multipart fields 'cloth' and 'model'"), 400
    reset_dirs()
    Image.open(request.files["cloth"].stream).convert("RGB").save(f"{INPUTS}/cloth/cloth.jpg")
    Image.open(request.files["model"].stream).convert("RGB").save(f"{INPUTS}/image/model.jpg")

    os.system(f"python {ROOT}/clothes-virtual-try-on/run.py")

    results = [f for f in os.listdir(OUTPUT) if not f.startswith(".")] if os.path.isdir(OUTPUT) else []
    if not results:
        return jsonify(error="the model produced no output; check the server log"), 500
    buf = io.BytesIO()
    Image.open(f"{OUTPUT}/{results[0]}").save(buf, "PNG")
    buf.seek(0)
    shutil.rmtree(OUTPUT, ignore_errors=True)
    return send_file(buf, mimetype="image/png")


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    token = os.environ.get("NGROK_AUTHTOKEN")
    if token:
        from pyngrok import ngrok
        ngrok.set_auth_token(token)
        print("Public URL (set as VITE_PHOTO_TRYON_URL):", ngrok.connect(port).public_url)
    app.run(host="0.0.0.0", port=port)
