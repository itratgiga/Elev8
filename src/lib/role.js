// Which side of Elev8 is open: "shop" (shopkeeper tools) or "client" (try-on and 360 for customers).
// Kept per browser tab session, so the choice is asked again after every new sign-in.
const KEY = 'elev8-role'

export const ROLES = {
  shop: { home: '/studio', paths: ['/studio', '/products'] },
  client: { home: '/tryon', paths: ['/tryon', '/view360'] },
}

export function getRole() {
  try {
    const r = sessionStorage.getItem(KEY)
    return ROLES[r] ? r : null
  } catch {
    return null
  }
}

export function setRole(role) {
  try {
    if (role) sessionStorage.setItem(KEY, role)
    else sessionStorage.removeItem(KEY)
  } catch {
    /* storage can be blocked; the choice then lasts until reload */
  }
}
