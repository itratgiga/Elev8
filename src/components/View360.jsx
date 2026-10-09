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
  const [angle, setAngle] = useState(0)
  const drag = useRef(null)
  const [touched, setTouched] = useState(!auto)

  useEffect(() => {
    setAngle(0)
    setTouched(!auto)
  }, [frames.length, frames[0]?.url])

  useEffect(() => {
    if (touched || frames.length < 2) return
    const id = setInterval(() => setAngle((a) => (a + 1.2) % 360), 30)
    return () => clearInterval(id)
  }, [touched, frames.length])

  const n = frames.length
  const index = n ? Math.floor((((angle % 360) + 360) % 360) / (360 / n)) % n : 0
  const goTo = (i) => {
    setTouched(true)
    setAngle((i + 0.5) * (360 / n))
  }

  const down = (e) => {
    drag.current = { x: e.clientX, a: angle }
    setTouched(true)
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const move = (e) => {
    if (!drag.current) return
    setAngle(drag.current.a - (e.clientX - drag.current.x) * 0.6)
  }
  const up = () => {
    drag.current = null
  }
  const key = (e) => {
    if (e.key === 'ArrowLeft') goTo((index - 1 + n) % n)
    if (e.key === 'ArrowRight') goTo((index + 1) % n)
  }

  return (
    <div className="turn-wrap">
      <div
        className="turn"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onKeyDown={key}
        tabIndex={0}
        role="img"
        aria-label="Product turntable. Drag left or right to turn it."
      >
        {frames.map((f, i) => (
          <img key={i} src={f.url} alt="" draggable="false" className={i === index ? 'is-on' : ''} style={f.flip ? { transform: 'scaleX(-1)' } : undefined} />
        ))}
        <div className="turn-hint">{touched ? 'Drag to turn' : 'Touch and drag to turn'}</div>
        <div className="turn-label">{frames[index] ? (frames[index].flip ? 'side (other)' : frames[index].view) : ''}</div>
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
