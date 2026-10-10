import { useState } from 'react'
import { motion } from 'framer-motion'
import { supabase } from '../lib/supabase'

function friendly(err) {
  const m = (err.message || '').toLowerCase()
  if (m.includes('not confirmed')) return 'Your email is not confirmed yet. Open the confirmation email we sent (check Spam), or tap Resend below.'
  if (m.includes('invalid login')) return 'That email or password is not right. Check both and try again.'
  if (m.includes('already registered')) return 'This email is already registered. Please sign in instead.'
  if (m.includes('rate limit') || err.status === 429) return 'Too many tries or emails sent. Please wait a few minutes and try again.'
  if (m.includes('password')) return 'Password problem: ' + err.message
  if (m.includes('sending') || m.includes('smtp')) return 'We could not send the confirmation email right now. Please try again in a few minutes.'
  return 'Something went wrong: ' + err.message
}

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [mode, setMode] = useState('in')
  const [notice, setNotice] = useState('')
  const [needConfirm, setNeedConfirm] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    setNotice('')
    if (mode === 'up') {
      const { data, error: err } = await supabase.auth.signUp({ email, password })
      if (err) setError(friendly(err))
      else if (data.user && data.user.identities && data.user.identities.length === 0) setError('This email is already registered. Please sign in instead.')
      else if (!data.session) { setNotice('Account created. We sent a confirmation link to ' + email + '. Open it (check Spam too), then sign in.'); setNeedConfirm(true) }
      setBusy(false)
      return
    }
    const { error: err } = await supabase.auth.signInWithPassword({ email, password })
    if (err) {
      const m = (err.message || '').toLowerCase()
      if (m.includes('not confirmed')) setNeedConfirm(true)
      setError(friendly(err))
    }
    setBusy(false)
  }

  async function resend() {
    setBusy(true)
    const { error: err } = await supabase.auth.resend({ type: 'signup', email })
    setError(err ? friendly(err) : '')
    if (!err) setNotice('Confirmation email sent again. Check your inbox and Spam.')
    setBusy(false)
  }

  return (
    <main className="login">
      <motion.img
        className="login-mark"
        src="/logo.webp"
        alt=""
        initial={{ opacity: 0, rotate: -8, scale: 0.92 }}
        animate={{ opacity: 1, rotate: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 60, damping: 14 }}
      />
      <form className="login-card" onSubmit={submit}>
        <h1>Elev8 Studio</h1>
        <p className="muted">{mode === 'up' ? 'Create your free shop account.' : 'Sign in to your shop to create and publish posts.'}</p>

        <label className="field">
          <span>Email</span>
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="field">
          <span>Password</span>
          <input
            type="password"
            autoComplete={mode === 'up' ? 'new-password' : 'current-password'}
            minLength={mode === 'up' ? 8 : undefined}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {notice && <p className="form-ok" role="status">{notice}</p>}
        {needConfirm && email && (
          <button type="button" className="onb-link" onClick={resend} disabled={busy}>Resend confirmation email</button>
        )}
        <button className="btn btn-primary btn-block" disabled={busy}>
          {busy ? 'Please wait' : mode === 'up' ? 'Create account' : 'Sign in'}
        </button>
        <button
          type="button"
          className="onb-link"
          onClick={() => {
            setMode(mode === 'up' ? 'in' : 'up')
            setError('')
            setNotice('')
            setNeedConfirm(false)
          }}
        >
          {mode === 'up' ? 'Already have an account? Sign in' : 'New shopkeeper? Create account'}
        </button>
      </form>
    </main>
  )
}
