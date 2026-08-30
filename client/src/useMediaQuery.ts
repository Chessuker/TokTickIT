import { useEffect, useState } from 'react'

/**
 * Subscribes to a CSS media query so a component can render *one* layout rather
 * than rendering both and hiding one with CSS.
 *
 * That matters for the My Tickets screen (ui-spec.md §4): the desktop table and
 * the mobile card list carry the same ticket data, and shipping both to the DOM
 * would duplicate every ticket for screen readers and for anything walking the
 * accessibility tree.
 *
 * `matchMedia` is absent in some test environments; treating that as "does not
 * match" keeps the desktop layout as the fallback instead of throwing.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
    return window.matchMedia(query).matches
  })

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return

    const list = window.matchMedia(query)
    const onChange = (event: MediaQueryListEvent) => setMatches(event.matches)

    setMatches(list.matches)
    list.addEventListener('change', onChange)
    return () => list.removeEventListener('change', onChange)
  }, [query])

  return matches
}
