export const CSS = `
:host { all: initial; }
* { box-sizing: border-box; }
.win {
  position: fixed; z-index: 2147483000; width: 340px;
  font: 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, sans-serif; color: #111;
  background: #fff; border-radius: 6px; overflow: hidden;
  box-shadow: 0 18px 50px rgba(0,0,0,.28), 0 2px 8px rgba(0,0,0,.12);
  transition: width .25s ease, box-shadow .2s;
}
.win.big { width: min(78vw, 820px); }
.win.dragging { box-shadow: 0 0 0 3px #111, 0 18px 50px rgba(0,0,0,.3); }
.bar {
  height: 34px; display: flex; align-items: center; justify-content: center; position: relative;
  background: #fff; border-bottom: 1px solid #e8e8e8; cursor: grab; user-select: none; touch-action: none;
}
.bar:active { cursor: grabbing; }
.title { font-weight: 600; font-size: 13px; letter-spacing: .01em; }
.title i { font-style: normal; font-size: 10px; margin: 0 2px; color: #555; }
.min {
  position: absolute; right: 8px; top: 5px; width: 24px; height: 24px; border: 0; background: none;
  font-size: 16px; color: #888; cursor: pointer; border-radius: 4px;
}
.min:hover { background: #f1f1f1; color: #111; }
.collapsed .body { display: none; }

.body { position: relative; aspect-ratio: 8 / 7; background: #0b0b0b; overflow: hidden; }
.cam, .ai, .guide { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; transform: scaleX(-1); }
.guide { transform: none; }
.ai { opacity: 0; transition: opacity .45s ease; }
[data-phase="live"] .ai { opacity: 1; }
[data-phase="live"] .cam { opacity: 0; }

.timer {
  position: absolute; top: 8px; left: 8px; padding: 2px 7px; border-radius: 4px;
  background: rgba(0,0,0,.55); color: #fff; font: 600 11px/1.5 ui-monospace, Menlo, monospace;
}
.tools { position: absolute; left: 8px; bottom: 42px; display: flex; flex-direction: column; gap: 8px; }
.tools[hidden], .timer[hidden] { display: none; }
.tools button {
  width: 26px; height: 26px; padding: 4px; border: 0; border-radius: 50%; cursor: pointer;
  background: rgba(0,0,0,.18); display: grid; place-items: center;
}
.tools button:hover { background: rgba(0,0,0,.4); }
.tools svg { width: 16px; height: 16px; fill: none; stroke: #fff; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
.tools button.on svg { fill: #fff; }
.mark {
  position: absolute; left: 10px; bottom: 8px; font: 500 15px/1 Georgia, "Times New Roman", serif;
  color: rgba(255,255,255,.55); letter-spacing: .02em; pointer-events: none; text-shadow: 0 1px 2px rgba(0,0,0,.3);
}
.hint {
  position: absolute; left: 50%; bottom: 18px; transform: translateX(-50%); white-space: nowrap;
  display: flex; align-items: center; gap: 8px; padding: 8px 14px; border-radius: 4px; cursor: pointer;
  background: rgba(40,40,40,.62); color: #fff; font-size: 12.5px; backdrop-filter: blur(6px);
}
.hint svg { width: 15px; height: 15px; fill: none; stroke: #fff; stroke-width: 1.7; }
.hint[hidden] { display: none; }
.step {
  position: absolute; left: 0; right: 0; bottom: 18px; text-align: center; color: #fff;
  font-weight: 600; font-size: 14px; text-shadow: 0 1px 4px rgba(0,0,0,.7);
}
.step[hidden] { display: none; }

.busy, .queue, .drop {
  position: absolute; inset: 0; display: grid; place-items: center; text-align: center;
}
.busy { background: rgba(0,0,0,.45); color: #fff; gap: 10px; align-content: center; backdrop-filter: blur(2px); }
.busy[hidden], .queue[hidden], .drop[hidden], .msg[hidden] { display: none; }
.spin { width: 28px; height: 28px; border-radius: 50%; border: 2.5px solid rgba(255,255,255,.25); border-top-color: #fff; animation: r .9s linear infinite; }
.spin.dark { border-color: #e2e2e2; border-top-color: #777; margin: 0 auto 10px; }
@keyframes r { to { transform: rotate(360deg); } }

.queue { background: rgba(0,0,0,.25); }
.queue .card {
  width: 84%; background: #f6f6f6; border-radius: 3px; padding: 18px 14px 14px;
  box-shadow: 0 8px 30px rgba(0,0,0,.25);
}
.tag { display: inline-block; font-size: 9px; letter-spacing: .12em; color: #666; background: #e8e8e8; padding: 2px 6px; border-radius: 2px; }
.pos { font-size: 18px; font-weight: 700; margin: 8px 0 2px; }
.eta { color: #555; font-size: 12.5px; }
.fast { color: #777; font-size: 11px; margin-top: 4px; }
.skip {
  margin-top: 12px; width: 100%; padding: 8px; border: 1px solid #bbb; background: #fff; cursor: pointer;
  font: 600 10px/1 inherit; letter-spacing: .12em; color: #333;
}
.skip[hidden], .fast[hidden] { display: none; }
.drop { background: rgba(255,255,255,.12); border: 2px dashed rgba(255,255,255,.8); margin: 8px; border-radius: 6px; pointer-events: none; }
.drop span { color: #fff; font-weight: 600; background: rgba(0,0,0,.55); padding: 8px 14px; border-radius: 4px; }
.msg {
  position: absolute; left: 10px; right: 10px; top: 10px; padding: 8px 10px; border-radius: 4px;
  background: rgba(20,20,20,.85); color: #fff; font-size: 12px; text-align: center;
}
.flash { position: absolute; inset: 0; background: #fff; opacity: .85; pointer-events: none; }
.flash[hidden], .preview[hidden] { display: none; }
.preview { position: absolute; inset: 0; background: rgba(0,0,0,.82); display: grid; place-items: center; align-content: center; gap: 14px; padding: 16px; }
.preview img { max-width: 100%; max-height: 72%; border-radius: 8px; object-fit: contain; }
.pbtns { display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; }
.pbtns button { min-height: 44px; padding: 0 20px; border-radius: 999px; border: 0; cursor: pointer; font: 600 15px/1 inherit; background: #fff; color: #111; }
.pbtns button[data-p='save'] { background: #1aa56b; color: #fff; }
.close { display: none; }
.win.full { inset: 0 !important; width: 100vw; height: 100vh; border-radius: 0; box-shadow: none; display: flex; flex-direction: column; }
.win.full.big { width: 100vw; }
.win.full .bar { height: 56px; cursor: default; flex: none; }
.win.full .title { font-size: 16px; }
.win.full .min, .win.full .tools [data-act="expand"] { display: none; }
.win.full .close {
  display: block; position: absolute; right: 12px; top: 8px; height: 40px; padding: 0 18px; border: 1px solid #ddd;
  border-radius: 999px; background: #fff; font: 600 15px/1 inherit; cursor: pointer; color: #111;
}
.win.full .close:hover { background: #f1f1f1; }
.win.full .body { flex: 1; aspect-ratio: auto; min-height: 0; }
.win.full .tools { left: 16px; bottom: 56px; gap: 12px; }
.win.full .tools button { width: 44px; height: 44px; padding: 10px; background: rgba(0,0,0,.5); }
.win.full .tools svg { width: 22px; height: 22px; }
.win.full .step { font-size: 22px; bottom: 32px; }
.win.full .tools { bottom: 64px; }
.win.full .timer { top: 14px; left: 14px; font-size: 15px; padding: 4px 10px; }
.win.full .hint { display: none; }
.win.full .mark { font-size: 22px; left: 16px; bottom: 14px; }
@media (max-width: 520px) { .win:not(.full):not(.inline) { width: calc(100vw - 24px); left: 12px !important; right: auto !important; } .win.big:not(.full):not(.inline) { width: calc(100vw - 24px); } }

.win.inline { position: relative; width: 100%; z-index: 1; border-radius: 16px; border: 1px solid #e8e4f3; }
.win.inline .bar { cursor: default; }
.win.inline .min, .win.inline .tools [data-act='expand'] { display: none; }
.win.inline .body { aspect-ratio: auto; height: clamp(420px, calc(100vh - 300px), 720px); width: 100%; }
.win.inline .tools { left: 12px; bottom: 48px; gap: 10px; }
.win.inline .tools button { width: 40px; height: 40px; padding: 9px; background: rgba(0,0,0,.5); }
.win.inline .tools svg { width: 22px; height: 22px; }
.win.inline .step { font-size: 18px; }
.win.inline .timer { font-size: 14px; padding: 3px 9px; }
.win.inline .hint { font-size: 14px; padding: 10px 16px; }
`;
