import { createContext, useContext } from 'react'

export type ToastTone = 'success' | 'error' | 'info'

export interface ToastInput {
  title: string
  description?: string
  tone?: ToastTone
}

export type ShowToast = (toast: ToastInput) => void

export const ToastContext = createContext<ShowToast | null>(null)

/**
 * Show a short message that disappears on its own:
 *   const toast = useToast()
 *   toast({ title: 'Item saved', tone: 'success' })
 */
export function useToast(): ShowToast {
  const showToast = useContext(ToastContext)
  if (!showToast) throw new Error('useToast must be used inside <ToastProvider>')
  return showToast
}
