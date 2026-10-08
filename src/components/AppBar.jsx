import { supabase } from '../lib/supabase'
import { Link } from '../lib/nav.jsx'

export const TABS = [
  ['/products', 'Products'],
  ['/studio', 'Posts'],
  ['/tryon', 'Try-on and Kiosk'],
  ['/view360', '360° view'],
]

export default function AppBar({ shop, session, path }) {
  return (
    <header className="topbar">
      <a className="brand" href="/" aria-label="Elev8 home page">
        <img src="/logo.webp" alt="" width="34" height="34" />
        <span className="brand-name">Elev8</span>
        <span className="brand-sep" aria-hidden="true" />
        <span className="shop-name">{shop?.name ?? 'Your shop'}</span>
      </a>
      <nav className="nav" aria-label="Sections">
        {TABS.map(([to, label]) => (
          <Link key={to} to={to} className={`nav-item ${path === to ? 'is-on' : ''}`} aria-current={path === to ? 'page' : undefined}>
            {label}
          </Link>
        ))}
      </nav>
      <div className="topbar-right">
        <span className="who">{session.user.email}</span>
        <button className="btn btn-quiet" onClick={() => supabase.auth.signOut()}>
          Sign out
        </button>
      </div>
    </header>
  )
}
