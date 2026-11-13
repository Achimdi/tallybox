import { useQueryClient } from '@tanstack/react-query'
import { RotateCcw } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useApi } from '@/api/context'
import { Button } from '@/components/Button'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { useToast } from '@/components/toast-context'
import { useSession } from '@/features/auth/session'
import { userMessage } from '@/lib/errors'

/** Demo mode only: puts all demo data back to the starting set and signs everyone out. */
export function ResetDemoData() {
  const api = useApi()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const toast = useToast()
  const { signOut, clearBlocked } = useSession()
  const [open, setOpen] = useState(false)
  const [resetting, setResetting] = useState(false)

  const demo = api.demo
  if (!demo) return null

  const reset = async () => {
    setResetting(true)
    try {
      await demo.reset()
      queryClient.clear()
      clearBlocked()
      signOut()
      setOpen(false)
      toast({ title: 'Demo data reset', tone: 'success' })
      await navigate('/', { replace: true })
    } catch (error) {
      toast({ ...userMessage(error), tone: 'error' })
    } finally {
      setResetting(false)
    }
  }

  return (
    <>
      <Button
        variant="secondary"
        onClick={() => setOpen(true)}
        leadingIcon={<RotateCcw aria-hidden="true" className="size-5" />}
      >
        Reset demo data
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Reset the demo?"
        description="Everything in this browser's demo goes back to the starting data, and you are signed out. Codes and businesses you created are removed."
        confirmLabel="Reset demo"
        tone="danger"
        loading={resetting}
        onConfirm={() => void reset()}
      />
    </>
  )
}
