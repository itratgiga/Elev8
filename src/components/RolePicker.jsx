import '../role.css'
import { supabase } from '../lib/supabase'

const CARDS = [
  {
    role: 'shop',
    icon: 'S',
    title: 'Shopkeeper access',
    text: 'Run your shop: add products and publish to Instagram and Facebook.',
    items: ['Upload and manage products', 'AI posts and publishing', 'Automation and dashboard'],
  },
  {
    role: 'client',
    icon: 'C',
    title: 'Client access',
    text: 'What your customers use in the store or on their phone.',
    items: ['Virtual try-on', '360° product view'],
  },
]

export default function RolePicker({ shop, session, onPick }) {
  return (
    <main className="role-page">
      <div className="role-head">
        <img src="/logo.webp" alt="" />
        <h1>Welcome{shop?.name ? `, ${shop.name}` : ''}</h1>
        <p className="muted">Choose how you want to use Elev8 right now.</p>
      </div>
      <div className="role-grid">
        {CARDS.map((c) => (
          <button key={c.role} className="role-card" onClick={() => onPick(c.role)}>
            <span className="role-badge" aria-hidden="true">{c.icon}</span>
            <h2>{c.title}</h2>
            <p>{c.text}</p>
            <ul>{c.items.map((i) => <li key={i}>{i}</li>)}</ul>
            <span className="role-go">Continue →</span>
          </button>
        ))}
      </div>
      <button className="btn btn-quiet role-out" onClick={() => supabase.auth.signOut()}>
        Sign out ({session.user.email})
      </button>
    </main>
  )
}
