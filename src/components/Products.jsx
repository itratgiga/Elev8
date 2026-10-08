import { useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { publicUrl } from '../lib/supabase'
import { deletePhoto, deleteProduct, saveProduct, uploadPhoto } from '../lib/api'

const EMPTY = { name: '', category: '', price: '', description: '', sizes: '', colors: '' }

const VIEWS = [
  { id: 'front', label: 'Front' },
  { id: 'back', label: 'Back' },
  { id: 'side', label: 'Side' },
  { id: 'detail', label: 'Detail' },
]

function toForm(p) {
  return {
    name: p.name ?? '',
    category: p.category ?? '',
    price: p.price ?? '',
    description: p.description ?? '',
    sizes: (p.sizes ?? []).join(', '),
    colors: (p.colors ?? []).join(', '),
  }
}

export default function Products({ shop, products, images, loading, reload, toast }) {
  const [editing, setEditing] = useState(null) // null | 'new' | product id
  const [form, setForm] = useState(EMPTY)
  const [files, setFiles] = useState([]) // new photos picked in the form: {file, view, url}
  const [busy, setBusy] = useState(false)
  const [confirmId, setConfirmId] = useState(null)
  const fileInput = useRef(null)

  const imagesByProduct = useMemo(() => {
    const m = {}
    for (const i of images) (m[i.product_id] ??= []).push(i)
    return m
  }, [images])

  const current = editing && editing !== 'new' ? products.find((p) => p.id === editing) : null
  const currentImages = current ? imagesByProduct[current.id] ?? [] : []

  function openNew() {
    setForm(EMPTY)
    setFiles([])
    setEditing('new')
  }
  function openEdit(p) {
    setForm(toForm(p))
    setFiles([])
    setEditing(p.id)
  }
  function close() {
    files.forEach((f) => URL.revokeObjectURL(f.url))
    setFiles([])
    setEditing(null)
  }

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  function pick(e) {
    const picked = [...e.target.files]
    e.target.value = ''
    const taken = new Set([...currentImages.map((i) => i.view), ...files.map((f) => f.view)])
    const next = picked.map((file) => {
      const view = VIEWS.find((v) => !taken.has(v.id))?.id ?? 'detail'
      taken.add(view)
      return { file, view, url: URL.createObjectURL(file) }
    })
    setFiles((f) => [...f, ...next])
  }

  async function submit(e) {
    e.preventDefault()
    if (!shop) return toast('Your shop was not found. Please sign in again.', 'bad')
    setBusy(true)
    try {
      const id = await saveProduct(shop.id, form, current?.id)
      let failed = 0
      let order = currentImages.length
      for (const f of files) {
        try {
          await uploadPhoto(shop.id, id, f.file, f.view, order++)
        } catch (err) {
          failed++
          toast(`Photo not saved. ${err.message}`, 'bad')
        }
      }
      toast(current ? 'Product saved' : 'Product added')
      if (!failed) close()
      else setEditing(id)
      await reload()
    } catch (err) {
      toast(`Could not save. ${err.message}`, 'bad')
    } finally {
      setBusy(false)
    }
  }

  async function removePhoto(img) {
    try {
      await deletePhoto(img)
      toast('Photo removed')
      await reload()
    } catch (err) {
      toast(`Could not remove photo. ${err.message}`, 'bad')
    }
  }

  async function removeProduct(p) {
    try {
      await deleteProduct(p.id, (imagesByProduct[p.id] ?? []).map((i) => i.path))
      toast('Product deleted')
      setConfirmId(null)
      await reload()
    } catch (err) {
      toast(`Could not delete. ${err.message}`, 'bad')
    }
  }

  const cover = (p) => {
    const list = imagesByProduct[p.id] ?? []
    return list.find((i) => i.view === 'front') ?? list[0]
  }

  return (
    <section className="products" aria-labelledby="products-title">
      <div className="page-head">
        <div>
          <h2 id="products-title">Products</h2>
          <p className="muted">Add what you sell. Each product needs a clear front photo to make posts.</p>
        </div>
        <button className="btn btn-primary" onClick={openNew}>
          Add product
        </button>
      </div>

      <AnimatePresence initial={false}>
        {editing && (
          <motion.form
            key="form"
            className="product-form"
            onSubmit={submit}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <h3>{current ? 'Edit product' : 'New product'}</h3>
            <div className="form-grid">
              <label className="field span-2">
                <span>Name</span>
                <input required maxLength={120} value={form.name} onChange={set('name')} placeholder="Linen kurta, sky blue" />
              </label>
              <label className="field">
                <span>Category</span>
                <input maxLength={60} value={form.category} onChange={set('category')} placeholder="Kurta" />
              </label>
              <label className="field">
                <span>Price (₹)</span>
                <input type="number" min="0" step="1" inputMode="numeric" value={form.price} onChange={set('price')} placeholder="1499" />
              </label>
              <label className="field">
                <span>Sizes</span>
                <input value={form.sizes} onChange={set('sizes')} placeholder="S, M, L, XL" />
              </label>
              <label className="field">
                <span>Colours</span>
                <input value={form.colors} onChange={set('colors')} placeholder="Sky blue, white" />
              </label>
              <label className="field span-2">
                <span>Description (optional)</span>
                <textarea rows={3} maxLength={800} value={form.description} onChange={set('description')} placeholder="Soft linen, relaxed fit, good for summer." />
              </label>
            </div>

            <div className="photos">
              <p className="photos-title">Photos</p>
              <div className="photo-grid">
                {currentImages.map((img) => (
                  <figure key={img.id} className="thumb">
                    <img src={publicUrl('product-images', img.path)} alt={`${img.view} view`} />
                    <figcaption>{img.view}</figcaption>
                    <button type="button" className="thumb-x" aria-label={`Remove ${img.view} photo`} onClick={() => removePhoto(img)}>
                      ×
                    </button>
                  </figure>
                ))}
                {files.map((f, idx) => (
                  <figure key={f.url} className="thumb is-new">
                    <img src={f.url} alt="New photo" />
                    <select
                      aria-label="Which side is this photo?"
                      value={f.view}
                      onChange={(e) => setFiles((l) => l.map((x, i) => (i === idx ? { ...x, view: e.target.value } : x)))}
                    >
                      {VIEWS.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="thumb-x"
                      aria-label="Remove this photo"
                      onClick={() => {
                        URL.revokeObjectURL(f.url)
                        setFiles((l) => l.filter((_, i) => i !== idx))
                      }}
                    >
                      ×
                    </button>
                  </figure>
                ))}
                <button type="button" className="thumb add" onClick={() => fileInput.current?.click()}>
                  <span aria-hidden="true">+</span>
                  Add photo
                </button>
                <input ref={fileInput} type="file" accept="image/*" multiple hidden onChange={pick} />
              </div>
              <p className="hint">Use a plain background and good light. JPG, PNG or WebP, up to 8 MB each.</p>
            </div>

            <div className="row">
              <button className="btn btn-primary" disabled={busy || !form.name.trim()}>
                {busy ? 'Saving' : current ? 'Save product' : 'Add product'}
              </button>
              <button type="button" className="btn btn-quiet" onClick={close} disabled={busy}>
                Cancel
              </button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      {!loading && products.length === 0 && !editing && (
        <p className="empty">No products yet. Add your first one to start making posts.</p>
      )}

      <div className="product-grid">
        {products.map((p) => {
          const c = cover(p)
          const confirming = confirmId === p.id
          return (
            <motion.article key={p.id} layout="position" className="pcard">
              <div className="pcard-photo">
                {c ? (
                  <img src={publicUrl('product-images', c.path)} alt={p.name} loading="lazy" />
                ) : (
                  <div className="photo-missing">
                    <strong>No photo</strong>
                    <span>Add a front photo.</span>
                  </div>
                )}
              </div>
              <div className="pcard-body">
                <h3>{p.name}</h3>
                <p className="muted">
                  {[p.category, p.price != null ? `₹${Number(p.price).toLocaleString('en-IN')}` : null]
                    .filter(Boolean)
                    .join(' · ') || 'No price set'}
                </p>
                {confirming ? (
                  <div className="confirm" role="alertdialog" aria-label="Confirm delete">
                    <p>Delete this product and its photos?</p>
                    <div className="row">
                      <button className="btn btn-primary" onClick={() => removeProduct(p)}>
                        Delete
                      </button>
                      <button className="btn btn-quiet" onClick={() => setConfirmId(null)}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="row actions">
                    <button className="btn btn-secondary" onClick={() => openEdit(p)}>
                      Edit
                    </button>
                    <button className="btn btn-quiet" onClick={() => setConfirmId(p.id)}>
                      Delete
                    </button>
                  </div>
                )}
              </div>
            </motion.article>
          )
        })}
      </div>
    </section>
  )
}
