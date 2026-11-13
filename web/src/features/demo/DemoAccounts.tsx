import { KeyRound } from 'lucide-react'
import { useApi } from '@/api/context'
import type { DemoAccount } from '@/api/types'

interface DemoAccountsProps {
  portal: 'owner' | 'staff'
  /** Fills the sign-in form with this account. */
  onUse: (account: DemoAccount) => void
}

/**
 * Demo mode only: the made-up demo accounts for this login page. Tapping one
 * fills in the form, so trying the demo needs no typing.
 */
export function DemoAccounts({ portal, onUse }: DemoAccountsProps) {
  const api = useApi()
  const accounts = api.demo?.accounts.filter((account) => account.portal === portal) ?? []
  if (accounts.length === 0) return null

  const password = accounts[0]?.password
  return (
    <aside
      aria-labelledby="demo-accounts-title"
      className="flex flex-col gap-3 rounded-card border border-dashed border-line-control p-4"
    >
      <div className="flex flex-col">
        <p id="demo-accounts-title" className="flex items-center gap-2 text-label text-ink">
          <KeyRound aria-hidden="true" className="size-4" />
          Demo accounts
        </p>
        <p className="text-label font-normal text-ink-muted">
          Made up, and only work in this browser&apos;s demo. Password for all:{' '}
          <span className="font-semibold text-ink">{password}</span>
        </p>
      </div>
      <ul className="flex flex-col gap-2">
        {accounts.map((account) => {
          const login = account.email ?? `${account.businessCode} / ${account.username}`
          return (
            <li key={login}>
              <button
                type="button"
                onClick={() => onUse(account)}
                className="flex min-h-12 w-full flex-col items-start rounded-control border border-line bg-surface-raised px-3 py-2 text-left hover:border-primary"
              >
                <span className="text-label text-ink">
                  {account.label}
                  {account.hint ? (
                    <span className="font-normal text-ink-muted"> · {account.hint}</span>
                  ) : null}
                </span>
                <span className="text-caption break-all text-ink-muted">{login}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </aside>
  )
}
