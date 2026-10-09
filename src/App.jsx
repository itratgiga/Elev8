import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import { go, usePath } from './lib/nav.jsx'
import Login from './components/Login.jsx'
import Dashboard from './components/Dashboard.jsx'
import Tryon from './components/Tryon.jsx'
import View360 from './components/View360.jsx'
import Onboarding from './components/Onboarding.jsx'
import RolePicker from './components/RolePicker.jsx'
import { ROLES, getRole, setRole as saveRole } from './lib/role.js'
import { myShop } from './lib/api'

export default function App() {
  const [session, setSession] = useState(undefined) // undefined = still checking
  const path = usePath()
  const [shopReady, setShopReady] = useState(undefined) // undefined = checking
  const uid = session?.user?.id
  const [role, setRoleState] = useState(getRole)
  const pick = (r) => { saveRole(r); setRoleState(r); go(r ? ROLES[r].home : '/studio', true) }

  useEffect(() => {
    if (!uid) return setShopReady(undefined)
    myShop().then((r) => setShopReady(r || false)).catch(() => setShopReady({ onboarded_at: 'x' }))
  }, [uid])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null))
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => setSession(next))
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (path === '/kiosk') return go('/tryon?mode=kiosk', true)
    if (!['/studio', '/products', '/tryon', '/view360'].includes(path)) return go(role ? ROLES[role].home : '/studio', true)
    // Each side only opens its own pages (the kiosk link is for customers and stays open).
    if (role && !ROLES[role].paths.includes(path)) go(ROLES[role].home, true)
  }, [path, role])

  useEffect(() => {
    if (session === null) { saveRole(null); setRoleState(null) }
  }, [session])

  if (session === undefined) return <div className="boot" aria-busy="true" />
  if (!session) return <Login />
  if (shopReady === undefined) return <div className="boot" aria-busy="true" />
  if (shopReady === false || !shopReady.onboarded_at)
    return <Onboarding session={session} shop={shopReady || null} onDone={() => { setShopReady({ onboarded_at: 'x' }); go('/studio', true) }} />
  if (!role) return <RolePicker shop={shopReady} session={session} onPick={pick} />
  if (path === '/tryon') return <Tryon session={session} path={path} role={role} onSwitch={() => pick(null)} />
  if (path === '/view360') return <View360 session={session} path={path} role={role} onSwitch={() => pick(null)} />
  return <Dashboard session={session} path={path} role={role} onSwitch={() => pick(null)} view={path === '/products' ? 'products' : 'posts'} />
}
