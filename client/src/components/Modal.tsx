import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'

/**
 * The one confirmation-dialog frame (Lab 4 ui-spec.md §5 V-18; Lab 3 ui-spec.md
 * §2 "Confirmation dialog"). Issue #57 found that the five dialogs each built
 * their own frame and none kept keyboard focus inside: Tab walked out into the
 * page behind the backdrop. This frame:
 *
 * - moves focus into the dialog when it opens, unless something inside
 *   already has it (a dialog may focus its own primary button);
 * - keeps Tab and Shift+Tab cycling inside it;
 * - calls `onEscape` for Escape (the caller decides whether a busy dialog may
 *   close);
 * - gives focus back to whatever had it before the dialog opened.
 */

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

interface ModalProps {
  /** The id of the dialog's heading. */
  labelledBy: string
  onEscape: () => void
  children: ReactNode
  testId?: string
}

function Modal({ labelledBy, onEscape, children, testId }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const escapeRef = useRef(onEscape)
  escapeRef.current = onEscape

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const focusables = () => Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE))

    if (!dialog.contains(document.activeElement)) (focusables()[0] ?? dialog).focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        escapeRef.current()
        return
      }
      if (event.key !== 'Tab') return

      const items = focusables()
      if (items.length === 0) {
        event.preventDefault()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement
      if (event.shiftKey && (active === first || !dialog.contains(active))) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      // Back to the control that opened the dialog, if it is still there —
      // unless the screen has already sent focus somewhere on purpose (the
      // stale callout's Reload, say), which wins.
      const current = document.activeElement
      const unclaimed = !current || current === document.body || dialog.contains(current)
      if (unclaimed && opener && opener.isConnected) opener.focus()
    }
  }, [])

  return (
    <div className="zg-modal-backdrop" role="presentation">
      <div
        ref={dialogRef}
        className="zg-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        data-testid={testId}
      >
        {children}
      </div>
    </div>
  )
}

export default Modal
