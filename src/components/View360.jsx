import { useEffect, useMemo, useRef, useState } from 'react'
import { param } from '../lib/nav.jsx'
import { formatPrice, photoUrl, photosOf, useWorkspace } from '../lib/workspace.js'
import AppBar from './AppBar.jsx'

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
    if (touched || frames.length < 2) return
    const id = setInterval(() => setAngle((a) => (a + 1.2) % 360), 30)
    return () => clearInterval(id)
  }, [touched, frames.length])

  const n = frames.length
  const index = n ? Math.floor((((angle % 360) + 360) % 360) / (360 / n)) % n : 0

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

  return (
    <div
      className="turn"
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      role="img"
      aria-label="Product turntable. Drag left or right to turn it."
    >
      {frames.map((f, i) => (
        <img key={i} src={f.url} alt="" draggable="false" className={i === index ? 'is-on' : ''} style={f.flip ? { transform: 'scaleX(-1)' } : undefined} />
      ))}
      <div className="turn-hint">{touched ? 'Drag to turn' : 'Touch and drag to turn'}</div>
      <div className="turn-dots" aria-hidden="true">
        {frames.map((_, i) => (
          <i key={i} className={i === index ? 'is-on' : ''} />
        ))}
      </div>
    </div>
  )
}

export default function View360({ session, path }) {
  const ws = useWorkspace()
  const [pick, setPick] = useState(param('p'))
  const withPhotos = useMemo(() => ws.products.filter((p) => photosOf(ws.images, p.id).length), [ws.products, ws.images])
  const product = withPhotos.find((p) => p.id === pick) || withPhotos[0]
  const frames = product ? framesFor(ws.images, product.id) : []
  const have = new Set(product ? photosOf(ws.images, product.id).map((i) => i.view) : [])
  const missing = ['front', 'side', 'back'].filter((v) => !have.has(v))

  return (
    <div className="shell">
      <AppBar shop={ws.shop} session={session} path={path} />
      <main className="page view360">
        <section className="page-head">
          <h1>360° view</h1>
          <p className="muted">Customers turn the product with a finger and see every side. It uses the front, side and back photos from Products.</p>
        </section>
        {ws.error && <p className="banner banner-bad">Could not load products. {ws.error}</p>}
        {!ws.loading && !product && <p className="empty">Add a product with photos in Products first.</p>}
        {product && (
          <div className="view360-grid">
            <div className="stage-card">
              {frames.length >= 2 ? (
                <Turntable key={product.id} frames={frames} />
              ) : (
                <div className="photo-missing tall">
                  <strong>Needs more photos</strong>
                  <span>Add at least two angles (front, side or back) to turn this product.</span>
                </div>
              )}
            </div>
            <aside className="side-card">
              <h2>{product.name}</h2>
              <p className="muted">{[product.category, formatPrice(product)].filter(Boolean).join(' · ')}</p>
              {missing.length > 0 && (
                <p className="banner">
                  Add a {missing.join(' and a ')} photo in Products for a smoother turn.
                </p>
              )}
              <div className="chip-row" role="listbox" aria-label="Choose a product">
                {withPhotos.map((p) => (
                  <button key={p.id} className={`chip-btn ${p.id === product.id ? 'is-on' : ''}`} onClick={() => setPick(p.id)}>
                    {p.name}
                  </button>
                ))}
              </div>
            </aside>
          </div>
        )}
      </main>
    </div>
  )
}
