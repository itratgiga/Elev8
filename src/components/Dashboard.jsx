import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { LayoutGroup } from 'framer-motion'
import { checkMedia, createMedia, createPosts, deletePost, loadWorkspace, publishPost, updatePost } from '../lib/api'
import Composer from './Composer.jsx'
import PostCard from './PostCard.jsx'
import Toasts from './Toasts.jsx'
import AppBar from './AppBar.jsx'
import Products from './Products.jsx'

const COLUMNS = [
  {
    key: 'drafts',
    title: 'Drafts',
    hint: 'Check the caption and photo, then approve.',
    statuses: ['draft', 'rejected', 'failed', 'processing'],
  },
  {
    key: 'ready',
    title: 'Ready to post',
    hint: 'Approved posts. Publish now or pick a time.',
    statuses: ['approved'],
  },
  {
    key: 'scheduled',
    title: 'Scheduled',
    hint: 'These go out by themselves at the set time.',
    statuses: ['scheduled', 'publishing'],
  },
  {
    key: 'published',
    title: 'Published',
    hint: 'Live on your pages.',
    statuses: ['published'],
  },
]

export default function Dashboard({ session, path, view, role, onSwitch }) {
  const [data, setData] = useState({ shop: null, products: [], images: [], content: [] })
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [generating, setGenerating] = useState(false)
  const [tab, setTab] = useState('drafts')
  const [toasts, setToasts] = useState([])
  const toastId = useRef(0)

  const toast = useCallback((text, tone = 'ok') => {
    const id = ++toastId.current
    setToasts((t) => [...t, { id, text, tone }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === 'bad' ? 7000 : 3500)
  }, [])

  const reload = useCallback(async () => {
    try {
      setData(await loadWorkspace())
      setLoadError('')
    } catch (e) {
      setLoadError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  // Keep the board fresh. Scheduled posts are published by a background job, so poll.
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') reload()
    }, 10000)
    return () => clearInterval(id)
  }, [reload])

  const productsById = useMemo(
    () => Object.fromEntries(data.products.map((p) => [p.id, p])),
    [data.products],
  )

  // Patch one post in local state first so the board responds instantly.
  const patchLocal = (id, patch) =>
    setData((d) => ({ ...d, content: d.content.map((c) => (c.id === id ? { ...c, ...patch } : c)) }))

  async function run(id, patch, doneText) {
    const before = data.content.find((c) => c.id === id)
    patchLocal(id, patch)
    try {
      await updatePost(id, patch)
      if (doneText) toast(doneText)
    } catch (e) {
      patchLocal(id, before)
      toast(`Could not save. ${e.message}`, 'bad')
    }
    reload()
  }

  const actions = {
    approve: (id) => run(id, { status: 'approved', error_message: null }, 'Approved'),
    backToDraft: (id) => run(id, { status: 'draft' }, 'Moved back to drafts'),
    saveCaption: (id, caption) => run(id, { caption }, 'Caption saved'),
    setPlatforms: (id, platforms) => run(id, { platforms }),
    schedule: (id, iso) => run(id, { status: 'scheduled', scheduled_at: iso }, 'Scheduled'),
    unschedule: (id) => run(id, { status: 'approved', scheduled_at: null }, 'Schedule cancelled'),
    remove: async (id) => {
      const before = data
      setData((d) => ({ ...d, content: d.content.filter((c) => c.id !== id) }))
      try {
        await deletePost(id)
        toast('Deleted')
      } catch (e) {
        setData(before)
        toast(`Could not delete. ${e.message}`, 'bad')
      }
    },
    publish: async (id) => {
      patchLocal(id, { status: 'publishing' })
      try {
        const { ok, failed } = await publishPost(id)
        if (ok.length && !failed.length) toast(`Published to ${ok.join(' and ')}`)
        else if (ok.length) toast(`Published to ${ok.join(' and ')}. Failed: ${failed.join(' | ')}`, 'bad')
        else toast(`Could not publish. ${failed.join(' | ')}`, 'bad')
      } catch (e) {
        toast(`Could not publish. ${e.message}`, 'bad')
      }
      reload()
    },
  }

  // Reels take a few minutes. Ask the server about every video that is still being made.
  const processingKey = data.content
    .filter((c) => c.status === 'processing' && c.video_job)
    .map((c) => c.id)
    .join(',')
  useEffect(() => {
    if (!processingKey) return undefined
    let stop = false
    const tick = async () => {
      for (const id of processingKey.split(',')) {
        try {
          const r = await checkMedia(id)
          if (stop) return
          if (r.status === 'done') toast('Your reel is ready. Check it in Drafts.')
          if (r.status === 'failed') toast(`Reel failed. ${r.error}`, 'bad')
          if (r.status !== 'processing') reload()
        } catch (e) {
          if (!stop) toast(`Reel check failed. ${e.message}`, 'bad')
        }
      }
    }
    tick()
    const t = setInterval(tick, 15000)
    return () => {
      stop = true
      clearInterval(t)
    }
  }, [processingKey, reload, toast])

  async function onCreateMedia(productId, media, who, look, count) {
    setGenerating(media)
    try {
      const res = await createMedia(productId, media, who, look, count)
      if (media === 'reel' && res.reel_started) toast('Photo ready. The reel video is being made, about 2 to 5 minutes.')
      else if (media === 'reel') toast(`Photo saved, but the reel could not start. ${res.video_error}`, 'bad')
      else toast(`1 post with ${res.photos_made} ${res.photos_made === 1 ? "photo" : "photos"} is ready in Drafts`)
      setTab('drafts')
      await reload()
    } catch (e) {
      toast(`Could not create. ${e.message}`, 'bad')
    } finally {
      setGenerating(false)
    }
  }

  async function onCreate(productId) {
    setGenerating(true)
    try {
      const res = await createPosts(productId)
      const count = res?.drafts?.length ?? 0
      toast(count ? `${count} new drafts are ready` : 'Drafts created')
      if (res?.notes) toast(res.notes, 'bad')
      setTab('drafts')
      await reload()
    } catch (e) {
      toast(`Could not create posts. ${e.message}`, 'bad')
    } finally {
      setGenerating(false)
    }
  }

  const grouped = useMemo(() => {
    const out = {}
    for (const col of COLUMNS) out[col.key] = data.content.filter((c) => col.statuses.includes(c.status))
    // scheduled column: soonest first
    out.scheduled.sort((a, b) => new Date(a.scheduled_at ?? 0) - new Date(b.scheduled_at ?? 0))
    return out
  }, [data.content])


  return (
    <div className="shell">
      <AppBar shop={data.shop} session={session} path={path} role={role} onSwitch={onSwitch} />

      {view === 'products' ? (
        <main className="studio">
          <Products
            shop={data.shop}
            products={data.products}
            images={data.images}
            loading={loading}
            reload={reload}
            toast={toast}
          />
        </main>
      ) : (
      <main className="studio">
        <Composer
          products={data.products}
          images={data.images}
          generating={generating}
          onCreateMedia={onCreateMedia}
          loading={loading}
        />

        <section className="board-wrap" aria-label="Posts">
          {loadError && (
            <p className="banner banner-bad" role="alert">
              Could not load your posts. {loadError}
            </p>
          )}

          <div className="tabs" role="tablist" aria-label="Post status">
            {COLUMNS.map((col) => (
              <button
                key={col.key}
                role="tab"
                aria-selected={tab === col.key}
                className={`tab ${tab === col.key ? 'is-on' : ''}`}
                onClick={() => setTab(col.key)}
              >
                {col.title}
                <span className="count">{grouped[col.key].length}</span>
              </button>
            ))}
          </div>

          <LayoutGroup>
            <div className="board">
              {COLUMNS.map((col) => (
                <div key={col.key} className={`col ${tab === col.key ? 'is-on' : ''}`}>
                  <div className="col-head">
                    <h2>{col.title}</h2>
                    <span className="count">{grouped[col.key].length}</span>
                  </div>
                  <p className="col-hint">{col.hint}</p>

                  <div className="col-list">
                    {grouped[col.key].map((post) => (
                      <PostCard
                        key={post.id}
                        post={post}
                        product={productsById[post.product_id]}
                        actions={actions}
                      />
                    ))}
                    {!loading && grouped[col.key].length === 0 && (
                      <p className="empty">
                        {col.key === 'drafts'
                          ? 'No drafts. Pick a product above and create posts.'
                          : 'Nothing here yet.'}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </LayoutGroup>
        </section>
      </main>
      )}

      <Toasts items={toasts} />
    </div>
  )
}
