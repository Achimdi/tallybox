import { AlertDialog } from 'radix-ui'
import { Button } from './Button'

interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  /** Say plainly what will happen. */
  description: string
  confirmLabel: string
  cancelLabel?: string
  /** 'danger' for actions like voiding an order. */
  tone?: 'default' | 'danger'
  /** Called when the person confirms. The dialog stays open: close it when the work is done. */
  onConfirm: () => void
  /** Shows a spinner on the confirm button and blocks both buttons. */
  loading?: boolean
}

/**
 * Asks "are you sure?" before an important action.
 * Focus is trapped inside, Escape cancels, and focus starts on Cancel so a
 * stray Enter never confirms by accident.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  tone = 'default',
  onConfirm,
  loading = false,
}: ConfirmDialogProps) {
  return (
    <AlertDialog.Root
      open={open}
      onOpenChange={(next) => (loading ? undefined : onOpenChange(next))}
    >
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-40 bg-scrim data-[state=closed]:animate-fade-out data-[state=open]:animate-fade-in" />
        <AlertDialog.Content className="fixed top-1/2 left-1/2 z-50 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col gap-3 rounded-card bg-surface-raised p-6 shadow-raised data-[state=closed]:animate-fade-out data-[state=open]:animate-pop-in">
          <AlertDialog.Title className="text-title text-ink">{title}</AlertDialog.Title>
          <AlertDialog.Description className="text-body text-ink-muted">
            {description}
          </AlertDialog.Description>
          <div className="mt-3 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <AlertDialog.Cancel asChild>
              <Button variant="secondary" disabled={loading}>
                {cancelLabel}
              </Button>
            </AlertDialog.Cancel>
            <Button
              variant={tone === 'danger' ? 'danger' : 'primary'}
              loading={loading}
              onClick={onConfirm}
            >
              {confirmLabel}
            </Button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}
