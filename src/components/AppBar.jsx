import { supabase } from '../lib/supabase'
import { Link } from '../lib/nav.jsx'
import { ROLES } from '../lib/role.js'
import { shopLogoUrl } from '../lib/api'

export const TABS = [
  ['/products', 'Products'],
  ['/studio', 'Posts'],
  ['/tryon', 'Try-on and Kiosk'],
  ['/view360', '360° view'],
]

export default function AppBar({ shop, session, path, role, onSwitch }) {
  const tabs = role ? TABS.filter(([to]) => ROLES[role].paths.includes(to)) : TABS
  return (
    <header className="topbar">
      <a className="brand" href="/" aria-label="Elev8 home page">
        <img src="/logo.webp" alt="" width="34" height="34" />
        <span className="brand-name">Elev8</span>
        <span className="brand-sep" aria-hidden="true" />
        {shopLogoUrl(shop) && <img className="shop-logo" src={shopLogoUrl(shop)} alt="" width="34" height="34" />}
        <span className="shop-name">{shop?.name ?? 'Your shop'}</span>
      </a>
      <nav className="nav" aria-label="Sections">
        {tabs.map(([to, label]) => (
          <Link key={to} to={to} className={`nav-item ${path === to ? 'is-on' : ''}`} aria-current={path === to ? 'page' : undefined}>
            {label}
          </Link>
        ))}
      </nav>
      <div className="topbar-right">
        {onSwitch && (
          <button className="btn btn-quiet role-switch" onClick={onSwitch} title="Choose Shopkeeper or Client access">
            {role === 'client' ? 'Client access' : 'Shopkeeper access'} · Switch
          </button>
        )}
        <span className="who">{session.user.email}</span>
        <button className="btn btn-quiet" onClick={() => supabase.auth.signOut()}>
          Sign out
        </button>
      </div>
    </header>
  )
}
