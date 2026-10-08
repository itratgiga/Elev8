import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { createPosts, createShop, saveProduct, updateShop, uploadPhoto } from '../lib/api'
import { supabase } from '../lib/supabase'

const CATEGORIES = ['Clothing', 'Footwear', 'Jewellery', 'Beauty', 'Home decor', 'Grocery', 'Electronics', 'Other']
const LANGS = [
  { v: 'en', l: 'English' },
  { v: 'hi', l: 'Hindi' },
  { v: 'hinglish', l: 'Hinglish' },
]
const COLORS = ['#e8590c', '#c2255c', '#7048e8', '#1c7ed6', '#0b7285', '#2b8a3e', '#f08c00', '#212529']
const STEPS = ['Your shop', 'First product', 'Social pages', 'First post']

export default function Onboarding({ session, shop, onDone }) {
  const [shopId, setShopId] = useState(shop?.id ?? null)
  const [step, setStep] = useState(shop?.id ? 1 : 0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [productId, setProductId] = useState(null)
  const [posts, setPosts] = useState(null)

  const [form, setForm] = useState({
    name: shop?.name ?? '',
    city: '',
    category: shop?.category ?? '',
    whatsapp: '',
    language: 'hinglish',
    color: COLORS[0],
  })
  const [logo, setLogo] = useState(null)
  const preview = useMemo(() => (logo ? URL.createObjectURL(logo) : null), [logo])
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const [prod, setProd] = useState({ name: '', price: '', description: '' })
  const [photo, setPhoto] = useState(null)
  const photoPreview = useMemo(() => (photo ? URL.createObjectURL(photo) : null), [photo])

  const [social, setSocial] = useState({ instagram: '', facebook: '' })

  async function run(fn) {
    setBusy(true)
    setError('')
    try {
      await fn()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const saveShop = (e) => {
    e.preventDefault()
    if (!form.name.trim()) return setError('Please enter your shop name.')
    if (!form.category) return setError('Please choose what you sell.')
    if (!/^#[0-9a-f]{6}$/i.test(form.color)) return setError('Brand colour must be a code like #e8590c.')
    run(async () => {
      const id = await createShop(session.user.id, form, logo)
      setShopId(id)
      setStep(1)
    })
  }

  const saveFirstProduct = (e) => {
    e.preventDefault()
    if (!prod.name.trim()) return setError('Please enter the product name.')
    if (!photo) return setError('Please add a photo. Posts and try-on need it.')
    run(async () => {
      const id = await saveProduct(
        shopId,
        { name: prod.name, category: form.category, price: prod.price, description: prod.description, sizes: '', colors: '' },
        null,
      )
      await uploadPhoto(shopId, id, photo, 'front', 0)
      setProductId(id)
      setStep(2)
    })
  }

  const saveSocial = (e) => {
    e.preventDefault()
    run(async () => {
      await updateShop(shopId, {
        instagram_handle: social.instagram.trim().replace(/^@/, '') || null,
        facebook_page: social.facebook.trim() || null,
      })
      setStep(3)
    })
  }

  const makePosts = () =>
    run(async () => {
      const res = await createPosts(productId)
      setPosts(res?.posts?.length ?? res?.count ?? 1)
    })

  const finish = () =>
    run(async () => {
      await updateShop(shopId, { onboarded_at: new Date().toISOString() })
      onDone()
    })

  const skip = () => {
    setError('')
    setStep((s) => s + 1)
  }

  return (
    <main className="onb">
      <div className="onb-card">
        <img className="onb-mark" src="/logo.webp" alt="" />
        <ol className="onb-steps" aria-label="Setup progress">
          {STEPS.map((s, i) => (
            <li key={s} className={i === step ? 'is-now' : i < step ? 'is-done' : ''}>
              <span>{i < step ? '✓' : i + 1}</span>
              {s}
            </li>
          ))}
        </ol>

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            className="onb-body"
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.22 }}
          >
            {step === 0 && (
              <form onSubmit={saveShop} className="onb-body">
                <h1>Set up your shop</h1>
                <p className="muted">One minute. This helps Elev8 write posts in your shop voice.</p>

                <div className="onb-preview" style={{ borderColor: form.color }}>
                  <span className="onb-logo" style={{ background: form.color }}>
                    {preview ? <img src={preview} alt="" /> : (form.name.trim()[0] || 'S').toUpperCase()}
                  </span>
                  <span>
                    <strong>{form.name.trim() || 'Your shop name'}</strong>
                    <small>{[form.category, form.city.trim()].filter(Boolean).join(' · ') || 'Category · City'}</small>
                  </span>
                </div>

                <label className="field">
                  <span>Shop name</span>
                  <input required value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Raj Fashion Store" />
                </label>
                <div className="field">
                  <span>What do you sell?</span>
                  <div className="chip-row">
                    {CATEGORIES.map((c) => (
                      <button type="button" key={c} className={'chip-btn' + (form.category === c ? ' is-on' : '')} onClick={() => set('category', c)}>
                        {c}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="onb-row">
                  <label className="field">
                    <span>City</span>
                    <input value={form.city} onChange={(e) => set('city', e.target.value)} placeholder="Mumbai" />
                  </label>
                  <label className="field">
                    <span>WhatsApp number</span>
                    <input type="tel" inputMode="tel" value={form.whatsapp} onChange={(e) => set('whatsapp', e.target.value)} placeholder="+91 98xxxxxxxx" />
                  </label>
                </div>
                <div className="field">
                  <span>Language for posts</span>
                  <div className="chip-row">
                    {LANGS.map((l) => (
                      <button type="button" key={l.v} className={'chip-btn' + (form.language === l.v ? ' is-on' : '')} onClick={() => set('language', l.v)}>
                        {l.l}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="field">
                  <span>Brand colour</span>
                  <div className="onb-colors">
                    {COLORS.map((c) => (
                      <button type="button" key={c} aria-label={c} className={'onb-dot' + (form.color === c ? ' is-on' : '')} style={{ background: c }} onClick={() => set('color', c)} />
                    ))}
                  </div>
                  <div className="onb-custom">
                    <input type="color" aria-label="Pick any colour" value={/^#[0-9a-f]{6}$/i.test(form.color) ? form.color : '#e8590c'} onChange={(e) => set('color', e.target.value)} />
                    <input type="text" aria-label="Colour code" placeholder="#e8590c" maxLength={7} value={form.color} onChange={(e) => { let v = e.target.value.trim(); if (v && v[0] !== '#') v = '#' + v; set('color', v) }} />
                    {form.color && !/^#[0-9a-f]{6}$/i.test(form.color) && <small className="form-error">Use a code like #e8590c</small>}
                  </div>
                </div>
                <label className="field">
                  <span>Logo (optional)</span>
                  <input type="file" accept="image/*" onChange={(e) => setLogo(e.target.files?.[0] ?? null)} />
                </label>
                {error && <p className="form-error" role="alert">{error}</p>}
                <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Creating your shop' : 'Save and continue'}</button>
              </form>
            )}

            {step === 1 && (
              <form onSubmit={saveFirstProduct} className="onb-body">
                <h1>Add your first product</h1>
                <p className="muted">Start with your best seller. A clear front photo works best. You can add more later in Products.</p>
                <label className="field">
                  <span>Product name</span>
                  <input required value={prod.name} onChange={(e) => setProd({ ...prod, name: e.target.value })} placeholder="Cotton Kurta" />
                </label>
                <div className="onb-row">
                  <label className="field">
                    <span>Price (₹)</span>
                    <input type="number" min="0" inputMode="numeric" value={prod.price} onChange={(e) => setProd({ ...prod, price: e.target.value })} placeholder="999" />
                  </label>
                  <label className="field">
                    <span>Front photo</span>
                    <input type="file" accept="image/*" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
                  </label>
                </div>
                <label className="field">
                  <span>Short description (optional)</span>
                  <input value={prod.description} onChange={(e) => setProd({ ...prod, description: e.target.value })} placeholder="Soft cotton, regular fit" />
                </label>
                {photoPreview && <img className="onb-photo" src={photoPreview} alt="Product preview" />}
                {error && <p className="form-error" role="alert">{error}</p>}
                <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Saving product' : 'Save and continue'}</button>
                <button type="button" className="onb-link" onClick={skip}>Skip for now</button>
              </form>
            )}

            {step === 2 && (
              <form onSubmit={saveSocial} className="onb-body">
                <h1>Your social pages</h1>
                <p className="muted">Tell us where your shop posts. The Elev8 team links publishing access to these pages with you, so you never share a password here.</p>
                <label className="field">
                  <span>Instagram username</span>
                  <input value={social.instagram} onChange={(e) => setSocial({ ...social, instagram: e.target.value })} placeholder="@rajfashionstore" />
                </label>
                <label className="field">
                  <span>Facebook page name or link</span>
                  <input value={social.facebook} onChange={(e) => setSocial({ ...social, facebook: e.target.value })} placeholder="Raj Fashion Store" />
                </label>
                {error && <p className="form-error" role="alert">{error}</p>}
                <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Saving' : 'Save and continue'}</button>
                <button type="button" className="onb-link" onClick={skip}>I do not have pages yet</button>
              </form>
            )}

            {step === 3 && (
              <div className="onb-body">
                <h1>{posts ? 'Your first posts are ready' : 'Create your first post'}</h1>
                {posts ? (
                  <p className="muted">Done. Open the dashboard to check the captions, approve them and publish.</p>
                ) : productId ? (
                  <p className="muted">Elev8 will write captions and hashtags for your product. They stay as drafts until you approve them.</p>
                ) : (
                  <p className="muted">You skipped the product step, so there is nothing to post yet. Add a product from the Products page, then create posts from the dashboard.</p>
                )}
                {error && <p className="form-error" role="alert">{error}</p>}
                {productId && !posts && (
                  <button className="btn btn-primary btn-block" disabled={busy} onClick={makePosts}>
                    {busy ? 'Writing your posts' : 'Create my first posts'}
                  </button>
                )}
                <button className={'btn btn-block ' + (posts || !productId ? 'btn-primary' : 'btn-secondary')} disabled={busy} onClick={finish}>
                  Go to my dashboard
                </button>
                <ul className="onb-tour">
                  <li><strong>Posts</strong> write, approve and schedule</li>
                  <li><strong>Products</strong> photos and prices</li>
                  <li><strong>Try-on and Kiosk</strong> live try-on and a store screen</li>
                </ul>
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        <button type="button" className="onb-link" onClick={() => supabase.auth.signOut()}>Sign out</button>
      </div>
    </main>
  )
}
