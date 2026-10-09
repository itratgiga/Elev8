import { supabase } from './supabase'

// ---- Reading -------------------------------------------------------------

export async function loadWorkspace() {
  const [shop, products, images, content] = await Promise.all([
    supabase.from('shops').select('id,name,logo_path').limit(1).maybeSingle(),
    supabase
      .from('products')
      .select('id,code,name,category,price,currency,description,sizes,colors,status,created_at')
      .order('created_at', { ascending: false }),
    supabase
      .from('product_images')
      .select('id,product_id,path,view,sort_order')
      .order('sort_order', { ascending: true }),
    supabase
      .from('generated_content')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100),
  ])
  const firstError = shop.error || products.error || images.error || content.error
  if (firstError) throw new Error(firstError.message)
  return {
    shop: shop.data,
    products: products.data ?? [],
    images: images.data ?? [],
    content: content.data ?? [],
  }
}

// ---- Writing -------------------------------------------------------------

export async function updatePost(id, patch) {
  const { error } = await supabase.from('generated_content').update(patch).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function deletePost(id) {
  const { error } = await supabase.from('generated_content').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

// ---- Edge functions ------------------------------------------------------

// supabase-js hides the JSON body of non-2xx responses inside error.context.
async function readFunctionBody(error) {
  try {
    return await error.context.json()
  } catch {
    return null
  }
}

function describePublishResults(results = {}) {
  const names = { instagram: 'Instagram', facebook: 'Facebook' }
  const ok = Object.entries(results).filter(([, r]) => r.ok).map(([k]) => names[k] ?? k)
  const failed = Object.entries(results)
    .filter(([, r]) => !r.ok)
    .map(([k, r]) => `${names[k] ?? k}: ${r.error}`)
  return { ok, failed }
}

export async function createPosts(productId) {
  const { data, error } = await supabase.functions.invoke('generate-content', {
    body: { product_id: productId },
  })
  if (error) {
    const body = await readFunctionBody(error)
    throw new Error(body?.error || error.message)
  }
  return data
}

// AI model photoshoot: media = 'photo' | 'reel'
export async function createMedia(productId, media, who, look) {
  const { data, error } = await supabase.functions.invoke('generate-media', {
    body: { product_id: productId, media, who, look },
  })
  if (error) {
    const body = await readFunctionBody(error)
    throw new Error(body?.error || error.message)
  }
  return data
}

export async function checkMedia(contentId) {
  const { data, error } = await supabase.functions.invoke('generate-media', {
    body: { action: 'check', content_id: contentId },
  })
  if (error) {
    const body = await readFunctionBody(error)
    throw new Error(body?.error || error.message)
  }
  return data
}

// Returns { ok: string[], failed: string[] }
export async function publishPost(contentId) {
  const { data, error } = await supabase.functions.invoke('publish-post', {
    body: { content_id: contentId },
  })
  if (error) {
    const body = await readFunctionBody(error)
    if (body?.results) return describePublishResults(body.results)
    throw new Error(body?.error || error.message)
  }
  return describePublishResults(data?.results)
}

// ---- Products and photos -------------------------------------------------

const MAX_PHOTO_BYTES = 8 * 1024 * 1024

const splitList = (v) =>
  (v ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)

const codeError = (e) => (e.code === '23505' ? 'That product code is already used by another product. Pick a different one.' : e.message)

export async function saveProduct(shopId, form, productId) {
  const row = {
    name: form.name.trim(),
    category: form.category.trim() || null,
    price: form.price === '' ? null : Number(form.price),
    description: form.description.trim() || null,
    sizes: splitList(form.sizes),
    colors: splitList(form.colors),
  }
  // Blank code: keep the old one when editing, and let the database hand out the next number for a new product.
  const code = (form.code ?? '').trim()
  if (code) row.code = code
  if (productId) {
    const { data, error } = await supabase.from('products').update(row).eq('id', productId).select('id').single()
    if (error) throw new Error(codeError(error))
    return data.id
  }
  const { data, error } = await supabase
    .from('products')
    .insert({ ...row, shop_id: shopId, status: 'active' })
    .select('id')
    .single()
  if (error) throw new Error(codeError(error))
  return data.id
}

export async function deleteProduct(productId, imagePaths = []) {
  if (imagePaths.length) await supabase.storage.from('product-images').remove(imagePaths)
  await supabase.from('product_images').delete().eq('product_id', productId)
  const { error } = await supabase.from('products').delete().eq('id', productId)
  if (error) throw new Error(error.message)
}

// Uploads one photo to product-images/<shop>/<product>/<view>-<time>.<ext>
export async function uploadPhoto(shopId, productId, file, view = 'front', sortOrder = 0) {
  if (!file.type.startsWith('image/')) throw new Error('Please choose an image file (JPG, PNG or WebP).')
  if (file.size > MAX_PHOTO_BYTES) throw new Error('This photo is larger than 8 MB. Please choose a smaller one.')
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '')
  const path = `${shopId}/${productId}/${view}-${Date.now()}.${ext || 'jpg'}`
  const up = await supabase.storage.from('product-images').upload(path, file, {
    contentType: file.type,
    upsert: false,
  })
  if (up.error) throw new Error(up.error.message)
  const { error } = await supabase
    .from('product_images')
    .insert({ shop_id: shopId, product_id: productId, path, view, sort_order: sortOrder })
  if (error) {
    await supabase.storage.from('product-images').remove([path])
    throw new Error(error.message)
  }
  return path
}

export async function deletePhoto(image) {
  await supabase.storage.from('product-images').remove([image.path])
  const { error } = await supabase.from('product_images').delete().eq('id', image.id)
  if (error) throw new Error(error.message)
}

// ---- Onboarding ----------------------------------------------------------

export async function myShop() {
  const { data, error } = await supabase
    .from('shops')
    .select('id,name,category,onboarded_at')
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data
}

export async function updateShop(shopId, patch) {
  const { error } = await supabase.from('shops').update(patch).eq('id', shopId)
  if (error) throw new Error(error.message)
}

export async function createShop(userId, form, logoFile) {
  const { data, error } = await supabase
    .from('shops')
    .insert({
      owner_id: userId,
      name: form.name.trim(),
      city: form.city.trim() || null,
      category: form.category || null,
      whatsapp: form.whatsapp.replace(/[^0-9+]/g, '') || null,
      default_language: form.language,
      brand_colors: form.color ? [form.color] : [],
    })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  if (logoFile) {
    if (!logoFile.type.startsWith('image/')) throw new Error('Logo must be an image file.')
    if (logoFile.size > MAX_PHOTO_BYTES) throw new Error('Logo is larger than 8 MB.')
    const ext = (logoFile.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '')
    const path = `${data.id}/logo-${Date.now()}.${ext || 'png'}`
    const up = await supabase.storage.from('shop-assets').upload(path, logoFile, { contentType: logoFile.type })
    if (!up.error) await supabase.from('shops').update({ logo_path: path }).eq('id', data.id)
  }
  return data.id
}
