import { useState } from 'react'
import { motion } from 'framer-motion'
import { publicUrl } from '../lib/supabase'

const PLATFORMS = [
  { id: 'instagram', label: 'Instagram' },
  { id: 'facebook', label: 'Facebook' },
]

const when = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
const fmt = (iso) => (iso ? when.format(new Date(iso)) : '')

// Value for <input type="datetime-local"> in the visitor's own timezone
function localInputValue(date) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function names(platforms = []) {
  const label = Object.fromEntries(PLATFORMS.map((p) => [p.id, p.label]))
  return platforms.map((p) => label[p] ?? p).join(' and ')
}

function profileLink(platform, id) {
  if (platform === 'facebook' && id) return `https://www.facebook.com/${id}`
  return null
}

export default function PostCard({ post, product, actions }) {
  const [mode, setMode] = useState('view') // view | edit | confirm | schedule
  const [caption, setCaption] = useState(post.caption ?? '')
  const [when_, setWhen] = useState('')
  const [whenError, setWhenError] = useState('')

  const isVideo = post.media_type === 'video'
  const mediaUrl = publicUrl('generated-content', post.asset_path)
  const editable = ['draft', 'rejected', 'failed', 'approved'].includes(post.status)
  const hasMedia = Boolean(post.asset_path)

  function togglePlatform(id) {
    const has = post.platforms?.includes(id)
    const next = has ? post.platforms.filter((p) => p !== id) : [...(post.platforms ?? []), id]
    if (next.length) actions.setPlatforms(post.id, next)
  }

  function openSchedule() {
    const soon = new Date(Date.now() + 10 * 60 * 1000)
    soon.setSeconds(0, 0)
    setWhen(localInputValue(soon))
    setWhenError('')
    setMode('schedule')
  }

  function submitSchedule(e) {
    e.preventDefault()
    const date = new Date(when_)
    if (Number.isNaN(date.getTime()) || date.getTime() < Date.now() + 2 * 60 * 1000) {
      setWhenError('Pick a time at least 2 minutes from now.')
      return
    }
    actions.schedule(post.id, date.toISOString())
    setMode('view')
  }

  const publishedResults = post.publish_results ?? {}

  return (
    <motion.article
      layout="position"
      layoutId={post.id}
      className={`card status-${post.status}`}
      transition={{ type: 'spring', stiffness: 260, damping: 30 }}
    >
      <div className="media">
        {hasMedia ? (
          isVideo ? (
            <video src={mediaUrl} muted loop playsInline controls preload="metadata" />
          ) : (
            <img src={mediaUrl} alt={product?.name ?? 'Post photo'} loading="lazy" />
          )
        ) : (
          <div className="photo-missing">
            <strong>No photo</strong>
            <span>Add a product photo, then create posts again.</span>
          </div>
        )}
        {isVideo && <span className="pill pill-media">Reel</span>}
      </div>

      <div className="card-body">
        {product && <p className="card-product">{product.name}</p>}

        {mode === 'edit' ? (
          <div className="edit">
            <label className="sr-only" htmlFor={`cap-${post.id}`}>
              Caption
            </label>
            <textarea
              id={`cap-${post.id}`}
              rows={6}
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
            />
            <div className="row">
              <button
                className="btn btn-primary"
                onClick={() => {
                  actions.saveCaption(post.id, caption.trim())
                  setMode('view')
                }}
                disabled={!caption.trim()}
              >
                Save caption
              </button>
              <button
                className="btn btn-quiet"
                onClick={() => {
                  setCaption(post.caption ?? '')
                  setMode('view')
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="caption">{post.caption}</p>
            {post.hashtags?.length > 0 && <p className="tags">{post.hashtags.join(' ')}</p>}
            {editable && (
              <button className="link" onClick={() => setMode('edit')}>
                Edit caption
              </button>
            )}
          </>
        )}

        {/* Where it goes */}
        <div className="platforms" role="group" aria-label="Post to">
          {PLATFORMS.map((p) => {
            const on = post.platforms?.includes(p.id)
            const result = publishedResults[p.id]
            const link = post.status === 'published' ? profileLink(p.id, result?.id) : null
            const classes = `chip ${on ? 'is-on' : ''} ${result ? (result.ok ? 'is-ok' : 'is-bad') : ''}`
            if (post.status === 'published' || !editable) {
              if (!on) return null
              return link ? (
                <a key={p.id} className={classes} href={link} target="_blank" rel="noreferrer">
                  {p.label}
                </a>
              ) : (
                <span key={p.id} className={classes}>
                  {p.label}
                </span>
              )
            }
            return (
              <button
                key={p.id}
                className={classes}
                aria-pressed={on}
                onClick={() => togglePlatform(p.id)}
              >
                {p.label}
              </button>
            )
          })}
        </div>

        {post.status === 'published' && (
          <p className="meta">
            Published {fmt(post.published_at)}
            {Object.values(publishedResults).some((r) => !r.ok) && (
              <span className="meta-bad">
                {' '}
                Failed on{' '}
                {names(Object.entries(publishedResults).filter(([, r]) => !r.ok).map(([k]) => k))}.
              </span>
            )}
          </p>
        )}
        {post.status === 'scheduled' && <p className="meta">Goes out {fmt(post.scheduled_at)}</p>}
        {post.status === 'publishing' && (
          <p className="meta meta-live" role="status">
            <span className="dot" aria-hidden="true" /> Publishing now
          </p>
        )}
        {post.status === 'processing' && <p className="meta">Video is being made. It appears here when ready.</p>}
        {post.error_message && post.status !== 'published' && (
          <p className="meta meta-bad">{post.error_message}</p>
        )}

        {/* Actions: the same words in the button, the confirmation and the toast */}
        {mode === 'confirm' && (
          <div className="confirm" role="alertdialog" aria-label="Confirm publish">
            <p>Post this to {names(post.platforms)} now?</p>
            <div className="row">
              <button
                className="btn btn-primary"
                onClick={() => {
                  setMode('view')
                  actions.publish(post.id)
                }}
              >
                Publish
              </button>
              <button className="btn btn-quiet" onClick={() => setMode('view')}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {mode === 'schedule' && (
          <form className="confirm" onSubmit={submitSchedule}>
            <label className="field">
              <span>Publish at</span>
              <input
                type="datetime-local"
                value={when_}
                onChange={(e) => setWhen(e.target.value)}
                required
              />
            </label>
            {whenError && <p className="form-error">{whenError}</p>}
            <div className="row">
              <button className="btn btn-primary">Schedule</button>
              <button type="button" className="btn btn-quiet" onClick={() => setMode('view')}>
                Cancel
              </button>
            </div>
          </form>
        )}

        {mode === 'view' && (
          <div className="row actions">
            {['draft', 'rejected', 'failed'].includes(post.status) && (
              <>
                <button
                  className="btn btn-primary"
                  onClick={() => actions.approve(post.id)}
                  disabled={!hasMedia}
                  title={hasMedia ? undefined : 'This post needs a photo before it can be approved'}
                >
                  Approve
                </button>
                <button className="btn btn-quiet" onClick={() => actions.remove(post.id)}>
                  Delete
                </button>
              </>
            )}
            {post.status === 'approved' && (
              <>
                <button className="btn btn-primary" onClick={() => setMode('confirm')}>
                  Publish
                </button>
                <button className="btn btn-secondary" onClick={openSchedule}>
                  Schedule
                </button>
                <button className="btn btn-quiet" onClick={() => actions.backToDraft(post.id)}>
                  Back to drafts
                </button>
              </>
            )}
            {post.status === 'scheduled' && (
              <button className="btn btn-secondary" onClick={() => actions.unschedule(post.id)}>
                Cancel schedule
              </button>
            )}
          </div>
        )}
      </div>
    </motion.article>
  )
}
