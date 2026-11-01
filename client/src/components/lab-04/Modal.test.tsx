import { describe, it, expect, vi } from 'vitest'
import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Modal from '../Modal'

/**
 * Issue #57 — V-18: every confirmation dialog traps focus, closes on Escape
 * and returns focus to its trigger. All five dialogs (status confirmation,
 * deactivate user, requester "appears resolved", remove attachment, close
 * follow-up) now render through this one frame.
 */

function Harness({ busy = false, onEscape }: { busy?: boolean; onEscape?: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      <button type="button">Behind the dialog</button>
      {open && (
        <Modal
          labelledBy="title"
          onEscape={() => {
            onEscape?.()
            if (!busy) setOpen(false)
          }}
        >
          <h2 id="title">Mark as Resolved?</h2>
          <button type="button">Confirm</button>
          <button type="button" disabled>
            Disabled
          </button>
          <button type="button" onClick={() => setOpen(false)}>
            Cancel
          </button>
        </Modal>
      )}
    </>
  )
}

describe('Modal (V-18)', () => {
  it('is a labelled modal dialog and takes focus when it opens', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Open' }))

    const dialog = screen.getByRole('dialog', { name: 'Mark as Resolved?' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByRole('button', { name: 'Confirm' })).toHaveFocus()
  })

  it('keeps Tab and Shift+Tab inside, skipping disabled controls', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Open' }))

    await user.tab()
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('button', { name: 'Confirm' })).toHaveFocus()
    await user.tab({ shift: true })
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus()
    expect(screen.getByRole('button', { name: 'Behind the dialog' })).not.toHaveFocus()
  })

  it('closes on Escape and gives focus back to the trigger', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const trigger = screen.getByRole('button', { name: 'Open' })
    await user.click(trigger)

    await user.keyboard('{Escape}')

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(trigger).toHaveFocus()
  })

  it('returns focus after a button closes it too', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const trigger = screen.getByRole('button', { name: 'Open' })
    await user.click(trigger)
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(trigger).toHaveFocus()
  })

  it('leaves the decision to the caller: a busy dialog may refuse Escape', async () => {
    const user = userEvent.setup()
    const onEscape = vi.fn()
    render(<Harness busy onEscape={onEscape} />)
    await user.click(screen.getByRole('button', { name: 'Open' }))

    await user.keyboard('{Escape}')

    expect(onEscape).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})
