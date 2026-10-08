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
