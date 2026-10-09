import { useCallback, useEffect, useState } from 'react'
import { loadWorkspace } from './api'
import { publicUrl } from './supabase'

export const photoUrl = (img) => (img ? publicUrl('product-images', img.path) : null)

const ORDER = { front: 0, side: 1, back: 2, detail: 3 }

export function photosOf(images, productId) {
  return images
    .filter((i) => i.product_id === productId)
    .sort((a, b) => (ORDER[a.view] ?? 9) - (ORDER[b.view] ?? 9) || a.sort_order - b.sort_order)
}

export function formatPrice(p) {
  if (p?.price == null) return ''
  const symbol = !p.currency || p.currency === 'INR' ? '₹' : `${p.currency} `
  return `${symbol}${Number(p.price).toLocaleString('en-IN')}`
}

export function useWorkspace() {
  const [data, setData] = useState({ shop: null, products: [], images: [], content: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const reload = useCallback(async () => {
    try {
      setData(await loadWorkspace())
      setError('')
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => {
    reload()
  }, [reload])
  return { ...data, loading, error, reload }
}

// Search helper for the "find by product code" box: matches the code or the name.
export const norm = (v) => String(v ?? '').trim().toLowerCase()

export function matchesQuery(p, q) {
  const n = norm(q)
  if (!n) return true
  return norm(p.code).includes(n) || norm(p.name).includes(n) || norm(p.category).includes(n)
}

export const exactByCode = (list, q) => {
  const n = norm(q)
  return n ? list.find((p) => norm(p.code) === n) : undefined
}

// Next free number for the "Auto" button (the database does the same when the box is left empty).
export function nextCode(products) {
  const nums = products.map((p) => (/^[0-9]{1,15}$/.test(p.code ?? '') ? Number(p.code) : 0))
  return String(Math.max(100, ...nums) + 1)
}
