import { useEffect, useMemo, useRef, useState } from 'react'
import { param } from '../lib/nav.jsx'
import { formatPrice, photoUrl, photosOf, useWorkspace } from '../lib/workspace.js'
import AppBar from './AppBar.jsx'
import '../v360.css'

// Turns the product's photos into a loop: front, side, back, then the side mirrored.
export function framesFor(images, productId) {
  const all = photosOf(images, productId).filter((i) => i.view !== 'detail')
  const frames = all.map((i) => ({ url: photoUrl(i), flip: false, view: i.view }))
  const side = all.find((i) => i.view === 'side')
  if (side && all.some((i) => i.view === 'back')) frames.push({ url: photoUrl(side), flip: true, view: 'side' })
  return frames
}

// Removes a plain studio background so only the product is left (runs in the browser, free).
const cutCache = new Map()
export function cutout(url) {
  if (cutCache.has(url)) return cutCache.get(url)
  const job = new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        const k = Math.min(1, 640 / Math.max(img.naturalWidth, img.naturalHeight))
        const w = Math.max(2, Math.round(img.naturalWidth * k))
        const h = Math.max(2, Math.round(img.naturalHeight * k))
        const c = document.createElement('canvas')
        c.width = w
        c.height = h
        const g = c.getContext('2d', { willReadFrequently: true })
        g.drawImage(img, 0, 0, w, h)
        const im = g.getImageData(0, 0, w, h)
        const d = im.data
        // average colour of the border = background
        let r0 = 0, g0 = 0, b0 = 0, cnt = 0
        const edge = (x, y) => {
          const o = (y * w + x) * 4
          r0 += d[o]; g0 += d[o + 1]; b0 += d[o + 2]; cnt++
        }
        for (let x = 0; x < w; x++) { edge(x, 0); edge(x, h - 1) }
        for (let y = 0; y < h; y++) { edge(0, y); edge(w - 1, y) }
        r0 /= cnt; g0 /= cnt; b0 /= cnt
        const seen = new Uint8Array(w * h)
        const stack = []
        const near = (o, pr, pg, pb, tol) => Math.abs(d[o] - pr) + Math.abs(d[o + 1] - pg) + Math.abs(d[o + 2] - pb) < tol
        const push = (x, y) => {
          const i = y * w + x
          if (seen[i]) return
          const o = i * 4
          if (!near(o, r0, g0, b0, 150)) return
          seen[i] = 1
          stack.push(i)
        }
        for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1) }
        for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y) }
        let removed = 0
        while (stack.length) {
          const i = stack.pop()
          const x = i % w
          const y = (i / w) | 0
          const o = i * 4
          removed++
          const pr = d[o], pg = d[o + 1], pb = d[o + 2]
          const nb = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]
          for (const [nx, ny] of nb) {
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
            const j = ny * w + nx
            if (seen[j]) continue
            const q = j * 4
            if (near(q, pr, pg, pb, 22) && near(q, r0, g0, b0, 170)) {
              seen[j] = 1
              stack.push(j)
            }
          }
        }
        const share = removed / (w * h)
        if (share < 0.12 || share > 0.9) return resolve(null)
        for (let i = 0; i < w * h; i++) if (seen[i]) d[i * 4 + 3] = 0
        // soften the edge by one pixel
        for (let y = 1; y < h - 1; y++)
          for (let x = 1; x < w - 1; x++) {
            const i = y * w + x
            if (seen[i]) continue
            if (seen[i - 1] || seen[i + 1] || seen[i - w] || seen[i + w]) d[i * 4 + 3] = 150
          }
        g.putImageData(im, 0, 0)
        resolve(c.toDataURL('image/png'))
      } catch (e) {
        resolve(null)
      }
    }
    img.onerror = () => resolve(null)
    img.src = url
  })
  cutCache.set(url, job)
  return job
}

export function Turntable({ frames, auto = true }) {
  const n = frames.length
  const step = 360 / n
  const faces = useRef([])
  const rot = useRef(0)
  const target = useRef(null)
  const drag = useRef(null)
  const idleAt = useRef(0)
  const idx = useRef(0)
  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(auto)
  const [touched, setTouched] = useState(false)
  const [cuts, setCuts] = useState({})

  useEffect(() => {
    let live = true
    setCuts({})
    frames.forEach((f) => {
      cutout(f.url).then((u) => {
        if (live && u) setCuts((c) => ({ ...c, [f.url]: u }))
      })
    })
    return () => {
      live = false
    }
  }, [frames.map((f) => f.url).join('|')])

  const apply = () => {
    for (let i = 0; i < n; i++) {
      const el = faces.current[i]
      if (!el) continue
      let diff = (((rot.current - i * step) % 360) + 540) % 360 - 180
      const x = (diff / step) * 90
      const c = Math.cos((x * Math.PI) / 180)
      if (Math.abs(x) >= 90 || c <= 0.02) {
        el.style.opacity = 0
        continue
      }
      const sx = Math.max(0.06, c) * (frames[i].flip ? -1 : 1)
      el.style.opacity = Math.min(1, c * c * 1.6)
      el.style.transform = `translateX(${(-x / 90) * 6}%) scaleX(${sx})`
    }
    const near = ((Math.round(rot.current / step) % n) + n) % n
    if (near !== idx.current) {
      idx.current = near
      setIndex(near)
    }
  }

  useEffect(() => {
    let raf
    let last = performance.now()
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const tick = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      if (!drag.current) {
        if (target.current !== null) {
          const dd = target.current - rot.current
          if (Math.abs(dd) < 0.3) {
            rot.current = target.current
            target.current = null
          } else rot.current += dd * Math.min(1, dt * 9)
        } else if (playing && !reduce && now > idleAt.current) {
          rot.current += 40 * dt
        }
      }
      apply()
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, n])

  useEffect(() => {
    rot.current = 0
    target.current = null
    setTouched(false)
  }, [frames[0]?.url, n])

  const goTo = (i) => {
    const cur = rot.current
    const base = Math.round(cur / 360) * 360 + i * step
    target.current = [base - 360, base, base + 360].reduce((a, b) => (Math.abs(b - cur) < Math.abs(a - cur) ? b : a))
    idleAt.current = performance.now() + 2500
  }
  const down = (e) => {
    drag.current = { x: e.clientX, r: rot.current }
    target.current = null
    setTouched(true)
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const move = (e) => {
    if (!drag.current) return
    rot.current = drag.current.r - (e.clientX - drag.current.x) * 0.45
  }
  const up = () => {
    if (drag.current) idleAt.current = performance.now() + 2500
    drag.current = null
  }
  const key = (e) => {
    if (e.key === 'ArrowLeft') goTo((index - 1 + n) % n)
    if (e.key === 'ArrowRight') goTo((index + 1) % n)
  }

  return (
    <div className="turn-wrap">
      <div
        className="turn turn3d"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onKeyDown={key}
        tabIndex={0}
        role="img"
        aria-label="Product turning in 360 degrees. Drag left or right to turn it by hand."
      >
        <div className="turn-floor" />
        {frames.map((f, i) => (
          <div key={i} ref={(el) => (faces.current[i] = el)} className="turn-face" style={{ opacity: i === 0 ? 1 : 0 }}>
            <img src={cuts[f.url] || f.url} alt="" draggable="false" className={cuts[f.url] ? 'is-cut' : 'is-blend'} />
          </div>
        ))}
        <div className="turn-hint">{touched || !playing ? 'Drag to turn' : 'Turning. Drag to turn it yourself'}</div>
        <div className="turn-label">{frames[index] ? (frames[index].flip ? 'side (other)' : frames[index].view) : ''}</div>
        <button
          type="button"
          className="turn-play"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => {
            setPlaying((v) => !v)
            idleAt.current = 0
          }}
          aria-label={playing ? 'Pause' : 'Start turning'}
        >
          {playing ? 'Pause' : 'Spin'}
        </button>
      </div>
      <div className="turn-strip" role="group" aria-label="Angles">
        {frames.map((f, i) => (
          <button key={i} type="button" className={i === index ? 'is-on' : ''} onClick={() => goTo(i)} aria-label={`Show ${f.view}`}>
            <img src={f.url} alt="" draggable="false" style={f.flip ? { transform: 'scaleX(-1)' } : undefined} />
            <span>{f.flip ? 'side 2' : f.view}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

export default function View360({ session, path, role, onSwitch }) {
  const ws = useWorkspace()
  const [pick, setPick] = useState(param('p'))
  const product = ws.products.find((p) => p.id === pick) || ws.products.find((p) => photosOf(ws.images, p.id).length) || ws.products[0]
  const photos = product ? photosOf(ws.images, product.id) : []
  const frames = product ? framesFor(ws.images, product.id) : []
  const have = new Set(photos.map((i) => i.view))
  const missing = ['front', 'side', 'back'].filter((v) => !have.has(v))

  return (
    <div className="shell">
      <AppBar shop={ws.shop} session={session} path={path} role={role} onSwitch={onSwitch} />
      <main className="page view360">
        <section className="page-head">
          <h1>360° view</h1>
          <p className="muted">Pick a product, then drag to turn it: front, side and back. It uses the photos you added in Products.</p>
        </section>
        {ws.error && <p className="banner banner-bad">Could not load products. {ws.error}</p>}
        {!ws.loading && !product && <p className="empty">Add a product with photos in Products first.</p>}
        {product && (
          <div className="v360-split">
            <aside className="plist v360-list" aria-label="Choose a product">
              <div className="plist-grid">
                {ws.products.map((p) => {
                  const first = photosOf(ws.images, p.id)[0]
                  return (
                    <button key={p.id} type="button" className={`ptile ${p.id === product.id ? 'is-on' : ''}`} onClick={() => setPick(p.id)}>
                      <span className="ptile-photo">{first ? <img src={photoUrl(first)} alt="" /> : null}</span>
                      <span className="ptile-name">{p.name}</span>
                      <span className="ptile-price">{formatPrice(p)}</span>
                    </button>
                  )
                })}
              </div>
            </aside>
            <div className="stage-card">
              {frames.length >= 2 ? (
                <Turntable key={product.id} frames={frames} />
              ) : frames.length === 1 ? (
                <div className="turn-wrap">
                  <div className="turn turn-still">
                    <img className="is-on" src={frames[0].url} alt={product.name} draggable="false" />
                  </div>
                  <p className="banner">Only one photo so far. Add a side and a back photo in Products to turn this product.</p>
                </div>
              ) : (
                <div className="photo-missing tall">
                  <strong>No photos yet</strong>
                  <span>Add front, side and back photos for {product.name} in Products.</span>
                </div>
              )}
              <div className="v360-info">
                <h2>{product.name}</h2>
                <p className="muted">{[product.category, formatPrice(product)].filter(Boolean).join(' · ')}</p>
                {frames.length >= 2 && missing.length > 0 && (
                  <p className="banner">Add a {missing.join(' and a ')} photo in Products for a smoother turn.</p>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
