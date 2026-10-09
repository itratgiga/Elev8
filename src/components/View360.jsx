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

export function Turntable({ frames, auto = true }) {
  const n = frames.length
  const step = 360 / n
  const box = useRef(null)
  const stage = useRef(null)
  const rot = useRef(0)
  const target = useRef(null)
  const drag = useRef(null)
  const idleAt = useRef(0)
  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(auto)
  const [touched, setTouched] = useState(false)
  const [width, setWidth] = useState(420)
  const idx = useRef(0)

  useEffect(() => {
    if (!box.current) return
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width))
    ro.observe(box.current)
    return () => ro.disconnect()
  }, [])

  const radius = n >= 3 ? (width * 0.72) / 2 / Math.tan(Math.PI / n) : 0
  const apply = () => {
    if (stage.current) stage.current.style.transform = `translateZ(${-radius}px) rotateY(${-rot.current}deg)`
    const i = ((Math.round(rot.current / step) % n) + n) % n
    if (i !== idx.current) {
      idx.current = i
      setIndex(i)
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
          const d = target.current - rot.current
          if (Math.abs(d) < 0.3) {
            rot.current = target.current
            target.current = null
          } else rot.current += d * Math.min(1, dt * 9)
        } else if (playing && !reduce && now > idleAt.current) {
          rot.current += 24 * dt
        }
      }
      apply()
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, n, width])

  useEffect(() => {
    rot.current = 0
    target.current = null
    setTouched(false)
  }, [frames[0]?.url, n])

  const goTo = (i) => {
    const cur = rot.current
    const base = Math.round(cur / 360) * 360 + i * step
    const cands = [base - 360, base, base + 360]
    target.current = cands.reduce((a, b) => (Math.abs(b - cur) < Math.abs(a - cur) ? b : a))
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
        ref={box}
        className="turn turn3d"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onKeyDown={key}
        tabIndex={0}
        role="img"
        aria-label="Product spinning in 360 degrees. Drag left or right to turn it by hand."
      >
        <div ref={stage} className="turn-stage" style={{ transform: `translateZ(${-radius}px)` }}>
          {frames.map((f, i) => (
            <div key={i} className="turn-face" style={{ transform: `rotateY(${i * step}deg) translateZ(${radius}px)` }}>
              <img src={f.url} alt="" draggable="false" style={f.flip ? { transform: 'scaleX(-1)' } : undefined} />
            </div>
          ))}
        </div>
        <div className="turn-hint">{touched || !playing ? 'Drag to turn' : 'Spinning. Drag to turn it yourself'}</div>
        <div className="turn-label">{frames[index] ? (frames[index].flip ? 'side (other)' : frames[index].view) : ''}</div>
        <button
          type="button"
          className="turn-play"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => {
            setPlaying((v) => !v)
            idleAt.current = 0
          }}
          aria-label={playing ? 'Pause spin' : 'Start spin'}
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

export default function View360({ session, path }) {
  const ws = useWorkspace()
  const [pick, setPick] = useState(param('p'))
  const product = ws.products.find((p) => p.id === pick) || ws.products.find((p) => photosOf(ws.images, p.id).length) || ws.products[0]
  const photos = product ? photosOf(ws.images, product.id) : []
  const frames = product ? framesFor(ws.images, product.id) : []
  const have = new Set(photos.map((i) => i.view))
  const missing = ['front', 'side', 'back'].filter((v) => !have.has(v))

  return (
    <div className="shell">
      <AppBar shop={ws.shop} session={session} path={path} />
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
