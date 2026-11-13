import { useQuery } from '@tanstack/react-query'
import { FileDown, ImageDown, MessageCircle, Printer, Share2 } from 'lucide-react'
import { useState } from 'react'
import type { Order } from '@/api/types'
import { BottomSheet } from '@/components/BottomSheet'
import { Button } from '@/components/Button'
import { FilterChips } from '@/components/FilterChips'
import { Skeleton } from '@/components/Skeleton'
import { useToast } from '@/components/toast-context'
import { useBusinessSettings } from '@/features/business/api'
import { logger } from '@/lib/logger'
import { readStored, writeStored } from '@/lib/storage'
import { RECEIPT_OUTPUTS, receiptPng, shareOrDownload, type ReceiptOutput } from './output'
import { PAPERS, PrintJob, type Paper } from './PrintReceipt'
import {
  buildReceipt,
  receiptMessage,
  whatsAppChatUrl,
  whatsAppNumber,
  type ReceiptData,
} from './receipt'

const PAPER_KEY = 'tb.print.paper'

function savedPaper(): Paper {
  const value = readStored('local', PAPER_KEY)
  return PAPERS.some((paper) => paper.value === value) ? (value as Paper) : '80mm'
}

const ICONS = { share: Share2, download_pdf: FileDown, download_image: ImageDown } as const

/**
 * Share, download, WhatsApp and print for one order's receipt. Receipts exist
 * only for confirmed orders (payment ticked); a voided order's carries a VOID mark.
 */
export function ReceiptActions({ order }: { order: Order }) {
  const settings = useBusinessSettings()
  if (settings.isPending) {
    return (
      <div role="status" className="flex flex-col gap-3">
        <span className="sr-only">Preparing the receipt</span>
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    )
  }
  if (settings.isError) {
    return (
      <div className="flex flex-col items-center gap-2 text-center">
        <p className="text-body text-ink-muted">
          The receipt couldn&apos;t be made. The order is saved.
        </p>
        <Button variant="secondary" onClick={() => void settings.refetch()}>
          Try again
        </Button>
      </div>
    )
  }
  return (
    <Actions
      receipt={buildReceipt(order, settings.data)}
      currencyCode={settings.data.currencyCode}
    />
  )
}

function Actions({ receipt, currencyCode }: { receipt: ReceiptData; currencyCode: string }) {
  const toast = useToast()
  const [busy, setBusy] = useState<ReceiptOutput['id'] | null>(null)
  const [paperOpen, setPaperOpen] = useState(false)
  const [paper, setPaper] = useState<Paper>(savedPaper)
  const [printJob, setPrintJob] = useState<{ paper: Paper; id: number } | null>(null)

  // Made ahead of time, so Share opens the share sheet straight from the tap
  // (phones refuse to share if too much time passes after the tap).
  const prepared = useQuery({
    queryKey: ['receipt-image', receipt],
    queryFn: () => receiptPng(receipt),
    staleTime: Infinity,
    gcTime: 60_000,
    retry: false,
  })

  const run = async (output: ReceiptOutput) => {
    setBusy(output.id)
    try {
      const result =
        output.id === 'share' && prepared.data
          ? await shareOrDownload(prepared.data, `Receipt ${receipt.orderNumber}`)
          : await output.send(receipt)
      if (result === 'downloaded') toast({ title: 'Receipt downloaded', tone: 'success' })
    } catch (error) {
      logger.error('receipt_failed', error, { output: output.id })
      toast({
        title: "The receipt couldn't be made",
        description: 'The order is saved. Try again.',
        tone: 'error',
      })
    } finally {
      setBusy(null)
    }
  }

  const number = receipt.customerPhone ? whatsAppNumber(receipt.customerPhone, currencyCode) : null
  const whatsAppUrl = number
    ? whatsAppChatUrl(number, receiptMessage(receipt))
    : `https://wa.me/?text=${encodeURIComponent(receiptMessage(receipt))}`
  const [share, ...downloads] = RECEIPT_OUTPUTS

  return (
    <div className="flex w-full flex-col gap-3">
      {share ? (
        <Button
          size="lg"
          fullWidth
          onClick={() => void run(share)}
          loading={busy === 'share'}
          loadingLabel="Preparing…"
          leadingIcon={<Share2 aria-hidden="true" className="size-5" />}
        >
          {share.label}
        </Button>
      ) : null}
      <a
        href={whatsAppUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-control border border-line-control bg-surface-raised px-4 text-body font-semibold text-ink transition-colors duration-150 hover:bg-surface-sunken"
      >
        <MessageCircle aria-hidden="true" className="size-5" />
        {number ? 'Send on WhatsApp' : 'Share on WhatsApp'}
      </a>
      <div className="grid grid-cols-3 gap-2">
        {downloads.map((output) => {
          const Icon = ICONS[output.id]
          return (
            <Button
              key={output.id}
              variant="ghost"
              onClick={() => void run(output)}
              loading={busy === output.id}
              loadingLabel="Preparing…"
              leadingIcon={<Icon aria-hidden="true" className="size-5" />}
              className="flex-col gap-1 px-1 text-label"
            >
              {output.label.replace('Download ', '')}
            </Button>
          )
        })}
        <Button
          variant="ghost"
          onClick={() => setPaperOpen(true)}
          leadingIcon={<Printer aria-hidden="true" className="size-5" />}
          className="flex-col gap-1 px-1 text-label"
        >
          Print
        </Button>
      </div>

      <BottomSheet open={paperOpen} onOpenChange={setPaperOpen} title="Print receipt">
        <div className="flex flex-col gap-4">
          <FilterChips label="Paper" options={PAPERS} value={paper} onChange={setPaper} />
          <p className="text-label font-normal text-ink-muted">
            Choose your printer in the next step. Small receipt printers set their own page length.
          </p>
          <Button
            size="lg"
            fullWidth
            leadingIcon={<Printer aria-hidden="true" className="size-5" />}
            onClick={() => {
              writeStored('local', PAPER_KEY, paper)
              setPaperOpen(false)
              setPrintJob({ paper, id: Date.now() })
            }}
          >
            Print
          </Button>
        </div>
      </BottomSheet>

      {printJob ? (
        <PrintJob
          key={printJob.id}
          receipt={receipt}
          paper={printJob.paper}
          onDone={() => setPrintJob(null)}
        />
      ) : null}
    </div>
  )
}
