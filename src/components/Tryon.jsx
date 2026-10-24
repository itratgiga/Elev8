import { useEffect, useMemo, useRef, useState } from 'react'
import { mount } from '../tryon/widget.js'
import { param } from '../lib/nav.jsx'
import { exactByCode, formatPrice, matchesQuery, photoUrl, photosOf, useWorkspace } from '../lib/workspace.js'
import AppBar from './AppBar.jsx'
import CodeSearch from './CodeSearch.jsx'

export default function Tryon({ session, path, role, onSwitch }) {
  const ws = useWorkspace()
  const widget = useRef(null)
  const mirrorRef = useRef(null)
  const snapRef = useRef(null)
  const [kiosk, setKiosk] = useState(param('mode') === 'kiosk')
  const [cat, setCat] = useState('All')
  const [active, setActive] = useState(null)
  const [q, setQ] = useState('')
  const [drop, setDrop] = useState(false)
  useEffect(() => {
    widget.current = mount({
      brand: ws.shop?.name || 'Elev8',
      apiUrl: '/api/tryon', // proxied to the local vton-server (see vite.config.js)
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
  const shown = items.filter((x) => (cat === 'All' || x.p.category === cat) && matchesQuery(x.p, q))

  const pick = (x) => { setActive(x.p.id); widget.current?.tryOn(photoUrl(x.photo)) }
  const onSnap = (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) { setActive(null); widget.current?.tryOn(f) } }

  // Typing an exact product code starts that try-on straight away.
  const lastCode = useRef('')
  useEffect(() => {
    const hit = exactByCode(items.map((x) => x.p), q)
    if (!hit) { lastCode.current = ''; return }
    if (lastCode.current === hit.id) return
    lastCode.current = hit.id
    const x = items.find((i) => i.p.id === hit.id)
    if (x) pick(x)
  }, [q, items.length])

  // Drag a product tile onto the mirror to try it on.
  const onDropMirror = (e) => {
    e.preventDefault()
    setDrop(false)
    const x = items.find((i) => i.p.id === e.dataTransfer.getData('text/plain'))
    if (x) pick(x)
  }

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
              Allow the camera, stand straight with your arms down, then tap any product on the right. A photo is taken after a 3 second countdown and the garment is put on it (it can take a while). Tap another product to change it on the same photo, or use the camera button on the result to retake. Snap a product to try any garment you photograph. Start store kiosk makes this a full screen counter display.
            </p>
          )}
        </section>

        <div className="tryon-split">
          <div
            className={'mirror-col' + (drop ? ' is-drop' : '')}
            ref={mirrorRef}
            onDragOver={(e) => { e.preventDefault(); setDrop(true) }}
            onDragLeave={() => setDrop(false)}
            onDrop={onDropMirror}
          />
          <aside className="plist" aria-label="Products">
            <CodeSearch value={q} onChange={setQ} onEnter={() => shown[0] && pick(shown[0])} count={shown.length} total={items.length} />
            <div className="kiosk-cats" role="tablist" aria-label="Categories">
              {cats.map((c) => (
                <button key={c} role="tab" aria-selected={cat === c} className={`kcat ${cat === c ? 'is-on' : ''}`} onClick={() => setCat(c)}>{c}</button>
              ))}
            </div>
            {ws.error && <p className="banner banner-bad">Could not load the range. {ws.error}</p>}
            {!ws.loading && shown.length === 0 && <p className="empty">No products with photos yet. Add some in Products.</p>}
            <div className="plist-grid">
              {shown.map((x) => (
                <button key={x.p.id} className={'ptile' + (active === x.p.id ? ' is-on' : '')} onClick={() => pick(x)} draggable="true" onDragStart={(e) => e.dataTransfer.setData('text/plain', x.p.id)}>
                  <span className="ptile-photo"><img src={photoUrl(x.photo)} alt="" loading="lazy" /></span>
                  <span className="ptile-name">{x.p.name}</span>
                  {x.p.code && <span className="ptile-code">Code {x.p.code}</span>}
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
