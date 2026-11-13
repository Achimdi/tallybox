import { canvasToJpeg, canvasToPng, imagesToPdf, PAGE } from '@/lib/imagePdf'
import { drawReceipt } from './drawReceipt'
import { receiptFileName, type ReceiptData } from './receipt'

/**
 * Ways a receipt leaves the app. Order screens only see this list, so a direct
 * thermal printer can be added later as one more output without touching any
 * order logic.
 */
export interface ReceiptOutput {
  id: 'share' | 'download_image' | 'download_pdf'
  label: string
  /** What happened, for the confirmation message. */
  send(receipt: ReceiptData): Promise<'shared' | 'downloaded' | 'cancelled'>
}

export async function receiptPng(receipt: ReceiptData): Promise<File> {
  const canvas = await drawReceipt(receipt)
  return new File([await canvasToPng(canvas)], receiptFileName(receipt, 'png'), {
    type: 'image/png',
  })
}

export async function receiptPdf(receipt: ReceiptData): Promise<File> {
  const canvas = await drawReceipt(receipt)
  const jpeg = await canvasToJpeg(canvas, 0.92)
  // 80 mm wide, as long as the receipt needs.
  const pageWidth = PAGE.receipt80.width
  const pdf = imagesToPdf(
    [
      {
        jpeg,
        pixelWidth: canvas.width,
        pixelHeight: canvas.height,
        pageWidth,
        pageHeight: (canvas.height / canvas.width) * pageWidth,
      },
    ],
    `${receipt.businessName} receipt ${receipt.orderNumber}`,
  )
  return new File([pdf], receiptFileName(receipt, 'pdf'), { type: 'application/pdf' })
}

/** Saves a file through a temporary link. Works in every browser. */
export function downloadFile(file: Blob, name: string): void {
  const url = URL.createObjectURL(file)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.rel = 'noopener'
  document.body.append(link)
  link.click()
  link.remove()
  // Give the browser time to start the download before freeing the file.
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

/** True when this browser can hand files to the phone's share sheet. */
export function canShareFiles(): boolean {
  if (typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function')
    return false
  try {
    const probe = new File([new Uint8Array([0])], 'receipt.png', { type: 'image/png' })
    return navigator.canShare({ files: [probe] })
  } catch {
    return false
  }
}

/**
 * Shares a file through the share sheet where the browser supports files,
 * otherwise downloads it. Closing the share sheet counts as cancelled, not failed.
 */
export async function shareOrDownload(
  file: File,
  title: string,
): Promise<'shared' | 'downloaded' | 'cancelled'> {
  if (canShareFiles() && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title })
      return 'shared'
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled'
      // Some browsers refuse at the last moment (for example without a recent tap): download instead.
    }
  }
  downloadFile(file, file.name)
  return 'downloaded'
}

export const RECEIPT_OUTPUTS: readonly ReceiptOutput[] = [
  {
    id: 'share',
    label: 'Share receipt',
    send: async (receipt) =>
      shareOrDownload(await receiptPng(receipt), `Receipt ${receipt.orderNumber}`),
  },
  {
    id: 'download_pdf',
    label: 'Download PDF',
    send: async (receipt) => {
      const file = await receiptPdf(receipt)
      downloadFile(file, file.name)
      return 'downloaded'
    },
  },
  {
    id: 'download_image',
    label: 'Download image',
    send: async (receipt) => {
      const file = await receiptPng(receipt)
      downloadFile(file, file.name)
      return 'downloaded'
    },
  },
]
