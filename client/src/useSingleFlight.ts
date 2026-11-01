import { useMemo, useRef } from 'react'

/**
 * One request at a time for a form (Lab 4 ui-spec.md §2 "Duplicate submit",
 * AC-10, AC-27).
 *
 * The busy state disables the button, but only after React re-renders. Two
 * submits in the same tick (a double press of Enter, a double click that
 * lands before the render) both see the old state and both send — Issue #54
 * proved this with a same-tick test. A ref changes immediately, so it closes
 * that gap: `begin()` answers `false` while a request is in flight, and the
 * handler's `finally` calls `end()`.
 *
 * Kept next to the other cross-screen hooks (`useMediaQuery`) so every form
 * guards the same way.
 */
export function useSingleFlight() {
  const inFlight = useRef(false)
  return useMemo(
    () => ({
      /** Claims the slot; `false` means a request is already running, so do nothing. */
      begin(): boolean {
        if (inFlight.current) return false
        inFlight.current = true
        return true
      },
      end(): void {
        inFlight.current = false
      },
    }),
    [],
  )
}
