import { Eye, EyeOff } from 'lucide-react'
import { useState } from 'react'
import { TextField, type TextFieldProps } from './TextField'

/** A password input with a show/hide button. */
export function PasswordField(props: Omit<TextFieldProps, 'type' | 'trailing'>) {
  const [visible, setVisible] = useState(false)
  const Icon = visible ? EyeOff : Eye
  return (
    <TextField
      {...props}
      type={visible ? 'text' : 'password'}
      autoCapitalize="none"
      autoCorrect="off"
      spellCheck={false}
      trailing={
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
          className="flex size-12 items-center justify-center rounded-control text-ink-muted hover:text-ink"
        >
          <Icon aria-hidden="true" className="size-5" />
        </button>
      }
    />
  )
}
