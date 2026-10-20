import { useEffect, useRef, useState } from 'react'
import { PHOTO_TRYON_URL, photoTryOn } from '../lib/photoTryon.js'

// Upload a full-length photo and see the selected product on it (runs on the GPU service).
export default function PhotoTryon({ garmentUrl, garmentName }) {
  const fileRef = useRef(null)
  const [person, setPerson] = useState(null)
  const [preview, setPreview] = useState(null)
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => () => { preview && URL.revokeObjectURL(preview); result && URL.revokeObjectURL(result) }, [preview, result])

  const onFile = (e) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    setPerson(f); setPreview(URL.createObjectURL(f)); setResult(null); setError('')
  }

  const run = async () => {
    setBusy(true); setError(''); setResult(null)
    try { setResult(await photoTryOn(person, garmentUrl)) }
    catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }

  return (
    <section className="photo-tryon">
      <h2>Photo try-on</h2>
      {!PHOTO_TRYON_URL && <p className="banner banner-bad">Not set up. Start clothes-virtual-try-on/server.py on a GPU and set VITE_PHOTO_TRYON_URL.</p>}
      <p className="muted">Upload a full-length photo of a person standing straight, then pick a product.{garmentName ? ` Selected: ${garmentName}.` : ''}</p>
      <div className="head-btns">
        <button className="btn btn-secondary" onClick={() => fileRef.current?.click()}>{person ? 'Change photo' : 'Upload photo'}</button>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />
        <button className="btn btn-primary" disabled={!PHOTO_TRYON_URL || !person || !garmentUrl || busy} onClick={run}>{busy ? 'Working… (can take a minute)' : 'Try it on'}</button>
      </div>
      {error && <p className="banner banner-bad">{error}</p>}
      <div className="photo-tryon-out">
        {preview && <img src={preview} alt="Your photo" />}
        {garmentUrl && <img src={garmentUrl} alt="Selected product" />}
        {result && <img src={result} alt="Try-on result" />}
      </div>
    </section>
  )
}
