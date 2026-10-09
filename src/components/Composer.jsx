import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { publicUrl } from '../lib/supabase'
import '../model.css'

function formatPrice(p) {
  if (p?.price == null) return ''
  const symbol = !p.currency || p.currency === 'INR' ? '₹' : `${p.currency} `
  return `${symbol}${Number(p.price).toLocaleString('en-IN')}`
}

export default function Composer({ products, images, generating, onCreate, onCreateMedia, loading }) {
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
          Pick a product. We write the caption and prepare Instagram and Facebook posts.
        </p>
        <div className="composer-controls">
          <label className="field">
            <span>Product</span>
            <select
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              disabled={generating || loading || !products.length}
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.price != null ? ` (${formatPrice(p)})` : ''}
                </option>
              ))}
            </select>
          </label>
          <button
            className="btn btn-primary"
            disabled={!productId || generating}
            onClick={() => onCreate(productId)}
          >
            {generating ? 'Creating posts' : 'Create posts'}
          </button>
        </div>
      </div>

      <div className="model-shoot">
        <h3>AI model photoshoot</h3>
        <p className="muted">
          A model wears your product. Get a photo or a reel, then post it.
        </p>
        <div className="composer-controls">
          <label className="field">
            <span>Model</span>
            <select value={who} onChange={(e) => setWho(e.target.value)} disabled={Boolean(generating)}>
              <option value="auto">Best fit</option>
              <option value="female">Female</option>
              <option value="male">Male</option>
            </select>
          </label>
          <label className="field">
            <span>Look</span>
            <select value={look} onChange={(e) => setLook(e.target.value)} disabled={Boolean(generating)}>
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
            disabled={!productId || Boolean(generating) || !photo}
            onClick={() => onCreateMedia(productId, 'photo', who, look)}
          >
            {generating === 'photo' ? 'Making photo' : 'Model photo'}
          </button>
          <button
            className="btn btn-secondary"
            disabled={!productId || Boolean(generating) || !photo}
            onClick={() => onCreateMedia(productId, 'reel', who, look)}
          >
            {generating === 'reel' ? 'Starting reel' : 'Model reel (video)'}
          </button>
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
            <p>{generating === true ? 'Writing your posts. This takes about 20 seconds.' : 'Dressing the model. This takes about 30 to 60 seconds.'}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}
