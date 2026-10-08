import { useState } from 'react'
import { motion } from 'framer-motion'
import { supabase } from '../lib/supabase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [mode, setMode] = useState('in')
  const [notice, setNotice] = useState('')

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    setNotice('')
    if (mode === 'up') {
      const { data, error: err } = await supabase.auth.signUp({ email, password })
      if (err) setError(err.message)
      else if (!data.session) setNotice('Account created. Check your email to confirm, then sign in.')
      setBusy(false)
      return
    }
    const { error: err } = await supabase.auth.signInWithPassword({ email, password })
    if (err) {
      setError(
        err.status === 400
          ? 'That email or password is not right. Check both and try again.'
          : `Could not sign in right now. ${err.message}`,
      )
    }
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
          }}
        >
          {mode === 'up' ? 'Already have an account? Sign in' : 'New shopkeeper? Create account'}
        </button>
      </form>
    </main>
  )
}
