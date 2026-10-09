import { useEffect, useMemo, useRef, useState } from 'react'
import { mount } from '../tryon/widget.js'
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../lib/supabase'
import { param } from '../lib/nav.jsx'
import { formatPrice, photoUrl, photosOf, useWorkspace } from '../lib/workspace.js'
import AppBar from './AppBar.jsx'

export default function Tryon({ session, path, role, onSwitch }) {
  const ws = useWorkspace()
  const widget = useRef(null)
  const mirrorRef = useRef(null)
  const snapRef = useRef(null)
  const [kiosk, setKiosk] = useState(param('mode') === 'kiosk')
  const [cat, setCat] = useState('All')
  const [active, setActive] = useState(null)
  // The widget keeps this object, so a refreshed login token is picked up on the next request.
  const headers = useRef({ apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${session.access_token}` })
  headers.current.Authorization = `Bearer ${session.access_token}`

  useEffect(() => {
    widget.current = mount({
      brand: ws.shop?.name || 'Elev8',
      tokenUrl: `${SUPABASE_URL}/functions/v1/tryon-token`,
      garmentUrl: `${SUPABASE_URL}/functions/v1/tryon-garment`,
      headers: headers.current,
      container: mirrorRef.current,
    })
    return () => widget.current?.destroy()
  }, [])

  const items = useMemo(
    () =>
      ws.products
        .filter((p) => p.status !== 'archived')
        .map((p) => ({ p, photo: photosOf(ws.images, p.id).find((i) => i.view === 'front') || photosOf(ws.images, p.id)[0] }))
        .filter((x) => x.photo),
    [ws.products, ws.images],
  )
  const cats = ['All', ...new Set(items.map((x) => x.p.category).filter(Boolean))]
  const shown = items.filter((x) => cat === 'All' || x.p.category === cat)

  const pick = (x) => { setActive(x.p.id); widget.current?.tryOn(photoUrl(x.photo)) }
  const onSnap = (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) { setActive(null); widget.current?.tryOn(f) } }

  // Opened with ?p=<product id>: start that product straight away.
  const wanted = param('p')
  const started = useRef(false)
  useEffect(() => {
    if (started.current || !wanted) return
    const hit = items.find((x) => x.p.id === wanted)
    if (hit) { started.current = true; pick(hit) }
  }, [wanted, items.length])

  const goKiosk = (on) => {
    setKiosk(on)
    if (on) document.documentElement.requestFullscreen?.().catch(() => {})
    else if (document.fullscreenElement) document.exitFullscreen?.()
  }

  return (
    <div className={'shell' + (kiosk ? ' tryon-kiosk' : '')}>
      {!kiosk && <AppBar shop={ws.shop} session={session} path={path} role={role} onSwitch={onSwitch} />}
      <main className="page tryon-page">
        <section className="page-head">
          <div className="head-row">
            <h1>{kiosk ? ws.shop?.name || 'Try-on' : 'Try-on and Kiosk'}</h1>
            <div className="head-btns">
              <button className="btn btn-primary" onClick={() => snapRef.current?.click()}>Snap a product</button>
              <input ref={snapRef} type="file" accept="image/*" capture="environment" hidden onChange={onSnap} />
              {kiosk ? (
                <button className="btn btn-secondary" onClick={() => goKiosk(false)}>Exit kiosk</button>
              ) : (
                <button className="btn btn-secondary" onClick={() => goKiosk(true)}>Start store kiosk</button>
              )}
            </div>
          </div>
          {!kiosk && (
            <p className="muted">
              Allow the camera, step back so your upper body fits, then tap any product on the right. The garment changes on you, live. Use the camera button on the mirror to take a photo. Snap a product to try any garment you photograph. Start store kiosk makes this a full screen counter display.
            </p>
          )}
        </section>

        <div className="tryon-split">
          <div className="mirror-col" ref={mirrorRef} />
          <aside className="plist" aria-label="Products">
            <div className="kiosk-cats" role="tablist" aria-label="Categories">
              {cats.map((c) => (
                <button key={c} role="tab" aria-selected={cat === c} className={`kcat ${cat === c ? 'is-on' : ''}`} onClick={() => setCat(c)}>{c}</button>
              ))}
            </div>
            {ws.error && <p className="banner banner-bad">Could not load the range. {ws.error}</p>}
            {!ws.loading && shown.length === 0 && <p className="empty">No products with photos yet. Add some in Products.</p>}
            <div className="plist-grid">
              {shown.map((x) => (
                <button key={x.p.id} className={'ptile' + (active === x.p.id ? ' is-on' : '')} onClick={() => pick(x)}>
                  <span className="ptile-photo"><img src={photoUrl(x.photo)} alt="" loading="lazy" /></span>
                  <span className="ptile-name">{x.p.name}</span>
                  <span className="ptile-price">{formatPrice(x.p)}</span>
                </button>
              ))}
            </div>
          </aside>
        </div>
      </main>
    </div>
  )
}
