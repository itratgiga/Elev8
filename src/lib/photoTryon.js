// Photo try-on runs on a separate GPU service (clothes-virtual-try-on/server.py).
export const PHOTO_TRYON_URL = (import.meta.env.VITE_PHOTO_TRYON_URL || '').replace(/\/$/, '')

export async function photoTryOn(personFile, garmentUrl) {
  if (!PHOTO_TRYON_URL) throw new Error('Photo try-on is not set up. Set VITE_PHOTO_TRYON_URL.')
  const garment = await fetch(garmentUrl).then((r) => {
    if (!r.ok) throw new Error('Could not load the product photo.')
    return r.blob()
  })
  const body = new FormData()
  body.append('model', personFile)
  body.append('cloth', garment, 'cloth.jpg')
  const res = await fetch(`${PHOTO_TRYON_URL}/api/transform`, {
    method: 'POST',
    body,
    headers: { 'ngrok-skip-browser-warning': '1' },
  })
  if (!res.ok) {
    const msg = await res.json().then((j) => j.error).catch(() => null)
    throw new Error(msg || `Photo try-on failed (${res.status}).`)
  }
  return URL.createObjectURL(await res.blob())
}
