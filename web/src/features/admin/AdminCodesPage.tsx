import { zodResolver } from '@hookform/resolvers/zod'
import { LIMITS } from '@shared/rules'
import { Copy, MessageCircle } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { ErrorBanner } from '@/components/Banner'
import { Button } from '@/components/Button'
import { buttonClasses } from '@/components/button-styles'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { ListGroup, ListItem } from '@/components/ListItem'
import { SectionHeader } from '@/components/SectionHeader'
import { SkeletonList } from '@/components/Skeleton'
import { EmptyState, ErrorState } from '@/components/states'
import { StatusChip } from '@/components/StatusChip'
import { TextField } from '@/components/TextField'
import { useToast } from '@/components/toast-context'
import { cn } from '@/lib/cn'
import { formatDate } from '@/lib/dates'
import { useOnlineStatus } from '@/lib/useOnlineStatus'
import {
  useAdminActivationCodes,
  useGenerateActivationCode,
  useRevokeActivationCode,
  type AdminActivationCode,
  type GeneratedCode,
} from './api'
import { activationMessage, whatsAppShareUrl } from './whatsapp'

const MY_TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone

const schema = z.object({
  ownerEmail: z
    .string()
    .trim()
    .min(1, "Enter the owner's email.")
    .pipe(z.email('Enter a valid email address.')),
  note: z.string().trim().max(LIMITS.noteMax, 'Use at most 200 characters.'),
  expiresInDays: z
    .number({ error: 'Enter a number of days.' })
    .int('Use a whole number of days.')
    .min(LIMITS.activationCodeDaysMin, 'Use at least 1 day.')
    .max(LIMITS.activationCodeDaysMax, 'Use at most 90 days.'),
})

type FormValues = z.infer<typeof schema>

function codeSubtitle(code: AdminActivationCode): string {
  const parts = [code.note ?? null]
  if (code.status === 'used') {
    parts.push(code.used_by_business_name ? `Used by ${code.used_by_business_name}` : 'Used')
  } else {
    const verb = code.status === 'expired' ? 'Expired' : 'Expires'
    parts.push(`${verb} ${formatDate(new Date(code.expires_at), MY_TIMEZONE)}`)
  }
  return parts.filter(Boolean).join(' · ')
}

/** Super-admin: generate, list and revoke activation codes. */
export default function AdminCodesPage() {
  const toast = useToast()
  const online = useOnlineStatus()
  const codes = useAdminActivationCodes()
  const generate = useGenerateActivationCode()
  const revoke = useRevokeActivationCode()

  const [fresh, setFresh] = useState<GeneratedCode | null>(null)
  const [toRevoke, setToRevoke] = useState<AdminActivationCode | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { ownerEmail: '', note: '', expiresInDays: 7 },
  })

  const onSubmit = handleSubmit((values) => {
    generate.mutate(values, {
      onSuccess: (code) => {
        setFresh(code)
        reset()
      },
    })
  })

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast({ title: 'Copied', tone: 'success' })
    } catch {
      toast({
        title: "Couldn't copy",
        description: 'Select the code and copy it by hand.',
        tone: 'error',
      })
    }
  }

  const confirmRevoke = () => {
    if (!toRevoke) return
    revoke.mutate(toRevoke.id, {
      onSuccess: () => toast({ title: 'Code revoked', tone: 'success' }),
      onError: () =>
        toast({
          title: "Couldn't revoke that code",
          description: 'It may have just been used. The list has been refreshed.',
          tone: 'error',
        }),
      onSettled: () => setToRevoke(null),
    })
  }

  const registerUrl = `${window.location.origin}/register`

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-title-lg text-ink">Activation codes</h1>

      {fresh ? (
        <section
          aria-labelledby="fresh-title"
          className="flex flex-col gap-4 rounded-card border-2 border-primary bg-surface-raised p-5 shadow-soft"
        >
          <div className="flex flex-col gap-1">
            <h2 id="fresh-title" className="text-label text-ink-muted">
              New code for {fresh.ownerEmail}
            </h2>
            <p className="text-display tracking-wider text-ink tabular-nums select-all">
              {fresh.code}
            </p>
            <p className="text-label font-normal text-ink-muted">
              Shown only this once. Copy or share it now. Expires{' '}
              {formatDate(new Date(fresh.expiresAt), MY_TIMEZONE)}.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button
              onClick={() => void copy(fresh.code)}
              leadingIcon={<Copy aria-hidden="true" className="size-5" />}
            >
              Copy
            </Button>
            <a
              href={whatsAppShareUrl(activationMessage(fresh, registerUrl, MY_TIMEZONE))}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(buttonClasses({ variant: 'secondary' }), 'hover:bg-surface-sunken')}
            >
              <MessageCircle aria-hidden="true" className="size-5" />
              <span>Share on WhatsApp</span>
            </a>
            <Button variant="ghost" onClick={() => setFresh(null)}>
              Done
            </Button>
          </div>
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <SectionHeader title="Generate a code" />
        <form
          noValidate
          onSubmit={(event) => void onSubmit(event)}
          className="flex max-w-md flex-col gap-4"
        >
          <ErrorBanner error={generate.error} />
          <TextField
            label="Owner's email"
            required
            type="email"
            inputMode="email"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            hint="Only this email can use the code."
            error={errors.ownerEmail?.message}
            {...register('ownerEmail')}
          />
          <TextField
            label="Note"
            autoComplete="off"
            hint="Optional. For example the client's name."
            error={errors.note?.message}
            {...register('note')}
          />
          <TextField
            label="Valid for (days)"
            required
            type="number"
            inputMode="numeric"
            min={LIMITS.activationCodeDaysMin}
            max={LIMITS.activationCodeDaysMax}
            error={errors.expiresInDays?.message}
            {...register('expiresInDays', { valueAsNumber: true })}
          />
          <div>
            <Button
              type="submit"
              loading={generate.isPending}
              loadingLabel="Generating…"
              disabled={!online}
            >
              Generate code
            </Button>
          </div>
        </form>
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeader title="Codes" />
        {codes.isPending ? (
          <SkeletonList rows={3} label="Loading codes" />
        ) : codes.isError ? (
          <div className="rounded-card border border-line bg-surface-raised">
            <ErrorState error={codes.error} onRetry={() => void codes.refetch()} />
          </div>
        ) : codes.data.length === 0 ? (
          <div className="rounded-card border border-line bg-surface-raised">
            <EmptyState
              title="No codes yet"
              description="Generate one above for each new business."
            />
          </div>
        ) : (
          <ListGroup>
            {codes.data.map((code) => (
              <ListItem
                key={code.id}
                title={code.owner_email}
                subtitle={codeSubtitle(code)}
                trailing={
                  <>
                    <StatusChip status={code.status} />
                    {code.status === 'unused' ? (
                      <Button variant="ghost" onClick={() => setToRevoke(code)} disabled={!online}>
                        Revoke
                      </Button>
                    ) : null}
                  </>
                }
              />
            ))}
          </ListGroup>
        )}
      </section>

      <ConfirmDialog
        open={toRevoke !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) setToRevoke(null)
        }}
        title="Revoke this code?"
        description={`The code for ${toRevoke?.owner_email ?? 'this owner'} will stop working. You can generate a new one at any time.`}
        confirmLabel="Revoke code"
        tone="danger"
        loading={revoke.isPending}
        onConfirm={confirmRevoke}
      />
    </div>
  )
}
