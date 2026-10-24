# vton-server: local try-on for Elev8

Replaces Decart with [SwayamInSync/clothes-virtual-try-on](https://github.com/SwayamInSync/clothes-virtual-try-on).
Elev8 (browser) takes one photo of the customer, sends it with the product photo to `POST /api/tryon`, and shows the returned image.
Vite proxies `/api` to this server on port 8787.

Important: unlike Decart this is **not live video**. It is one photo in, one photo out, and the real model needs an NVIDIA GPU.

## 0. Easiest: one command
```bash
npm install
npm start            # mock, opens the browser
npm run start:remote # real AI on a free hosted GPU (Hugging Face), no GPU needed
```
If the free Space is busy, set `HF_TOKEN` (free Hugging Face token) or `HF_SPACE=<your copy of the space>`.

## 1. Quick test, no GPU (mock mode)
```bash
npm install
npm run vton:install      # flask + pillow
npm run vton              # terminal 1, mock mode
npm run dev               # terminal 2 -> http://localhost:5173/tryon/
```
Mock mode only pastes the garment on the photo so you can check the whole Elev8 flow.

## 2. Real model (CUDA GPU machine, Linux)
The upstream repo has no installer; `setup_gradio.ipynb` in it lists every step. You need, inside `vton-server/`:
1. `git clone https://github.com/SwayamInSync/clothes-virtual-try-on` and put its weights in it: `checkpoints/{alias,gmm,seg}_final.pth` and `cloth_segm_u2net_latest.pth` (Google Drive ids are in the notebook).
2. OpenPose v1.7.0 built with Python/CUDA into `openpose/` (`openpose/build/examples/openpose/openpose.bin`).
3. `git clone https://github.com/PeikeLi/Self-Correction-Human-Parsing` with `checkpoints/final.pth` (LIP model).
4. `pip install torch torchvision torchgeometry opencv-python rembg[gpu] onnxruntime-gpu`.
5. `VTON_MODE=real npm run vton`. `GET http://127.0.0.1:8787/api/health` tells you what is still missing.

Paths can be overridden with `VTON_REPO`, `OPENPOSE_DIR`, `SCHP_DIR`. The server runs the upstream `run.py` pipeline with its hardcoded Colab `/content` paths rewritten to a temp folder, one request at a time.
If you have no local GPU, run the upstream Colab notebook and point this server at it instead (not wired up yet).
