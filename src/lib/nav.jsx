import { useEffect, useState } from 'react'

const read = () => location.pathname.replace(/[/]+$/, '') || '/'

// Tiny router: the pages are real files (/studio, /tryon ...) and move between each other without a reload.
export function usePath() {
  const [path, setPath] = useState(read)
  useEffect(() => {
    const f = () => setPath(read())
    addEventListener('popstate', f)
    return () => removeEventListener('popstate', f)
  }, [])
  return path
}

export const param = (key) => new URLSearchParams(location.search).get(key)

export function go(to, replace = false) {
  history[replace ? 'replaceState' : 'pushState'](null, '', to)
  dispatchEvent(new PopStateEvent('popstate'))
  scrollTo(0, 0)
}

export function Link({ to, children, ...rest }) {
  const onClick = (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button) return
    e.preventDefault()
    go(to)
  }
  return (
    <a href={to} onClick={onClick} {...rest}>
      {children}
    </a>
  )
}
