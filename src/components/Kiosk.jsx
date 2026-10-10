import { useEffect, useMemo, useState } from 'react'
import { formatPrice, photoUrl, photosOf, useWorkspace } from '../lib/workspace.js'
import { Turntable, framesFor } from './View360.jsx'
import { shopLogoUrl } from '../lib/api'

const IDLE_MS = 60000

export default function Kiosk({ ws, onTryOn, onExit, embedded = false }) {
  const [cat, setCat] = useState('All')
  const [open, setOpen] = useState(null)
  const [idle, setIdle] = useState(false)
  const [shot, setShot] = useState(0)
  const [turn, setTurn] = useState(false)

  const items = useMemo(
    () => ws.products.filter((p) => p.status !== 'archived').map((p) => ({ p, photos: photosOf(ws.images, p.id) })),
    [ws.products, ws.images],
  )
  const cats = ['All', ...new Set(items.map((x) => x.p.category).filter(Boolean))]
  const shown = items.filter((x) => cat === 'All' || x.p.category === cat)

  // Back to the welcome screen after a minute without a touch.
  useEffect(() => {
    if (embedded) return
    let t
    const reset = () => {
      clearTimeout(t)
      setIdle(false)
      t = setTimeout(() => {
        setIdle(true)
        setOpen(null)
        setCat('All')
      }, IDLE_MS)
    }
    reset()
    const evs = ['pointerdown', 'keydown']
    evs.forEach((e) => addEventListener(e, reset))
    return () => {
      clearTimeout(t)
      evs.forEach((e) => removeEventListener(e, reset))
    }
  }, [])

  // Slideshow on the welcome screen.
  const covers = items.filter((x) => x.photos.length)
  useEffect(() => {
    if (!idle || covers.length < 2) return
    const id = setInterval(() => setShot((s) => s + 1), 3500)
    return () => clearInterval(id)
  }, [idle, covers.length])

  const fullscreen = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.())
  const cur = open && items.find((x) => x.p.id === open)

  if (idle) {
    const c = covers[shot % Math.max(1, covers.length)]
    return (
      <main className="kiosk kiosk-idle" onClick={() => setIdle(false)}>
        <img className="idle-mark" src="/logo.webp" alt="" />
        {c && <img key={c.p.id} className="idle-shot" src={photoUrl(c.photos[0])} alt="" />}
        {shopLogoUrl(ws.shop) && <img className="idle-shop-logo" src={shopLogoUrl(ws.shop)} alt="" />}
        <h1>{ws.shop?.name || 'Welcome'}</h1>
        <p>Touch the screen to see our range</p>
      </main>
    )
  }

  return (
    <div className={'kiosk' + (embedded ? ' kiosk-embedded' : '')}>
      {!embedded && <header className="kiosk-bar">
        <div className="brand">
          <img src="/logo.webp" alt="" width="40" height="40" />
          {shopLogoUrl(ws.shop) && <img className="shop-logo" src={shopLogoUrl(ws.shop)} alt="" width="40" height="40" />}
          <span className="brand-name">{ws.shop?.name || 'Our range'}</span>
        </div>
        <div className="kiosk-actions">
          <button className="btn btn-quiet" onClick={fullscreen}>
            Full screen
          </button>
          <button className="btn btn-quiet" onClick={onExit}>
            Exit kiosk
          </button>
        </div>
      </header>}

      <div className="kiosk-cats" role="tablist" aria-label="Categories">
        {cats.map((c) => (
          <button key={c} role="tab" aria-selected={cat === c} className={`kcat ${cat === c ? 'is-on' : ''}`} onClick={() => setCat(c)}>
            {c}
          </button>
        ))}
      </div>

      {ws.error && <p className="banner banner-bad">Could not load the range. {ws.error}</p>}
      {!ws.loading && shown.length === 0 && <p className="empty">No products yet. Add some in Products.</p>}

      <div className="kiosk-grid">
        {shown.map(({ p, photos }) => (
          <button key={p.id} className="kcard" onClick={() => { setOpen(p.id); setShot(0); setTurn(false) }}>
            <span className="kcard-photo">{photos[0] ? <img src={photoUrl(photos[0])} alt="" loading="lazy" /> : <em>No photo</em>}</span>
            <span className="kcard-name">{p.name}</span>
            <span className="kcard-price">{formatPrice(p)}</span>
          </button>
        ))}
      </div>

      {cur && (
        <div className="ksheet" role="dialog" aria-modal="true" aria-label={cur.p.name}>
          <div className="ksheet-card">
            <button className="ksheet-close" onClick={() => setOpen(null)} aria-label="Close">
              Close
            </button>
            <div className="ksheet-media">
              {turn && framesFor(ws.images, cur.p.id).length >= 2 ? (
                <Turntable frames={framesFor(ws.images, cur.p.id)} />
              ) : (
                <>
                  <div className="ksheet-main">{cur.photos[shot] ? <img src={photoUrl(cur.photos[shot])} alt={cur.p.name} /> : <em>No photo</em>}</div>
                  <div className="ksheet-thumbs">
                    {cur.photos.map((ph, i) => (
                      <button key={ph.id} className={i === shot ? 'is-on' : ''} onClick={() => setShot(i)} aria-label={`${ph.view} photo`}>
                        <img src={photoUrl(ph)} alt="" />
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
            <div className="ksheet-info">
              <h2>{cur.p.name}</h2>
              <p className="kprice">{formatPrice(cur.p)}</p>
              {cur.p.description && <p className="muted">{cur.p.description}</p>}
              {cur.p.sizes?.length > 0 && (
                <div className="kopts">
                  <span>Sizes</span>
                  {cur.p.sizes.map((s) => (
                    <i key={s}>{s}</i>
                  ))}
                </div>
              )}
              {cur.p.colors?.length > 0 && (
                <div className="kopts">
                  <span>Colours</span>
                  {cur.p.colors.map((s) => (
                    <i key={s}>{s}</i>
                  ))}
                </div>
              )}
              <div className="kbtns">
                <button className="btn btn-primary" onClick={() => { onTryOn(cur.photos.find((i) => i.view === 'front') || cur.photos[0]); setOpen(null) }} disabled={!cur.photos.length}>
                  Try it on
                </button>
                {framesFor(ws.images, cur.p.id).length >= 2 && (
                  <button className="btn btn-secondary" onClick={() => setTurn((t) => !t)}>
                    {turn ? 'Show photos' : '360° view'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
