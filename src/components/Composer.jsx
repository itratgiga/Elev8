import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { publicUrl } from '../lib/supabase'
import '../model.css'

function formatPrice(p) {
  if (p?.price == null) return ''
  const symbol = !p.currency || p.currency === 'INR' ? '₹' : `${p.currency} `
  return `${symbol}${Number(p.price).toLocaleString('en-IN')}`
}

export default function Composer({ products, images, generating, onCreateMedia, loading }) {
  const busy = Boolean(generating)
  const [kind, setKind] = useState('photo')
  const [count, setCount] = useState(0)
  const [productId, setProductId] = useState('')
  const [who, setWho] = useState('auto')
  const [look, setLook] = useState('studio')

  useEffect(() => {
    if (!productId && products.length) setProductId(products[0].id)
  }, [products, productId])

  const product = products.find((p) => p.id === productId)
  const photo = images
    .filter((i) => i.product_id === productId)
    .sort((a, b) => (a.view === 'front' ? -1 : 0) - (b.view === 'front' ? -1 : 0))[0]
  const photoUrl = publicUrl('product-images', photo?.path)

  return (
    <section className="composer" aria-labelledby="composer-title">
      <div className="composer-photo">
        {photoUrl ? (
          <img src={photoUrl} alt={product?.name ?? 'Product'} />
        ) : (
          <div className="photo-missing">
            <strong>No photo</strong>
            <span>Add a front photo to this product.</span>
          </div>
        )}
      </div>

      <div className="composer-form">
        <h2 id="composer-title">Create posts</h2>
        <p className="muted">
          Pick a product from your library. An AI model wears that exact product and we prepare the posts.
        </p>
        <div className="composer-controls">
          <label className="field">
            <span>Product</span>
            <select
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              disabled={busy || loading || !products.length}
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.price != null ? ` (${formatPrice(p)})` : ''}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="model-shoot">
        <div className="kind-pick" role="group" aria-label="What to create">
          <button
            type="button"
            className={`kind ${kind === 'photo' ? 'is-on' : ''}`}
            aria-pressed={kind === 'photo'}
            onClick={() => setKind('photo')}
            disabled={busy}
          >
            <strong>Photos</strong>
            <span>1 to 5 pictures, different angles</span>
          </button>
          <button
            type="button"
            className={`kind ${kind === 'reel' ? 'is-on' : ''}`}
            aria-pressed={kind === 'reel'}
            onClick={() => setKind('reel')}
            disabled={busy}
          >
            <strong>Reel (video)</strong>
            <span>About 8 seconds, vertical</span>
          </button>
        </div>
        <div className="composer-controls">
          {kind === 'photo' && (
            <label className="field">
              <span>How many photos</span>
              <select value={count} onChange={(e) => setCount(Number(e.target.value))} disabled={busy}>
                <option value={0}>Auto (match my uploaded photos)</option>
                <option value={1}>1 photo</option>
                <option value={2}>2 photos</option>
                <option value={3}>3 photos</option>
                <option value={4}>4 photos</option>
                <option value={5}>5 photos</option>
              </select>
            </label>
          )}
          <label className="field">
            <span>Model</span>
            <select value={who} onChange={(e) => setWho(e.target.value)} disabled={busy}>
              <option value="auto">Best fit</option>
              <option value="female">Female</option>
              <option value="male">Male</option>
            </select>
          </label>
          <label className="field">
            <span>Look</span>
            <select value={look} onChange={(e) => setLook(e.target.value)} disabled={busy}>
              <option value="studio">Studio</option>
              <option value="street">Street</option>
              <option value="festive">Festive</option>
              <option value="store">Boutique</option>
            </select>
          </label>
        </div>
        <div className="row">
          <button
            className="btn btn-primary"
            disabled={!productId || busy || !photo}
            onClick={() => onCreateMedia(productId, kind, who, look, count)}
          >
            {busy ? 'Creating' : kind === 'reel' ? 'Create reel' : (count ? (count === 1 ? 'Create 1 photo' : `Create ${count} photos`) : 'Create photos')}
          </button>
          {!photo && <span className="muted">Add a photo to this product first.</span>}
        </div>
      </div>

      <AnimatePresence>
        {generating && (
          <motion.div
            className="making"
            role="status"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            <motion.img
              src="/logo.webp"
              alt=""
              animate={{ rotateY: 360 }}
              transition={{ duration: 3.2, ease: 'linear', repeat: Infinity }}
              style={{ transformPerspective: 600 }}
            />
            <p>{kind === 'reel' ? 'Dressing the model, then starting the video. About 1 minute.' : 'Dressing the model for each angle. About 1 minute.'}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}
