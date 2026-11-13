import { useEffect, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import type { ReceiptData } from './receipt'

export type Paper = '58mm' | '80mm' | 'a4'

export const PAPERS: readonly { value: Paper; label: string }[] = [
  { value: '58mm', label: '58 mm roll' },
  { value: '80mm', label: '80 mm roll' },
  { value: 'a4', label: 'A4 page' },
]

/** Printable width per paper. Roll printers set their own page length. */
const WIDTH: Record<Paper, string> = { '58mm': '48mm', '80mm': '72mm', a4: '120mm' }
const PAGE_RULE: Record<Paper, string> = {
  '58mm': '@page { margin: 2mm; }',
  '80mm': '@page { margin: 3mm; }',
  a4: '@page { size: A4; margin: 15mm; }',
}

function printRoot(): HTMLElement {
  let root = document.getElementById('print-root')
  if (!root) {
    root = document.createElement('div')
    root.id = 'print-root'
    document.body.append(root)
  }
  return root
}

/** The receipt as plain HTML, for the browser's print dialog. */
export function ReceiptDocument({ receipt, paper }: { receipt: ReceiptData; paper: Paper }) {
  const small = paper === '58mm'
  return (
    <article
      aria-label={`Receipt ${receipt.orderNumber}`}
      className="relative mx-auto bg-white font-sans text-black"
      style={{ width: WIDTH[paper], fontSize: small ? '9pt' : '10pt', lineHeight: 1.35 }}
    >
      {receipt.voided ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 flex items-center justify-center font-bold"
          style={{
            fontSize: small ? '40pt' : '64pt',
            color: 'rgba(198, 40, 40, 0.18)',
            transform: 'rotate(-30deg)',
          }}
        >
          VOID
        </div>
      ) : null}
      <header className="text-center">
        {receipt.logoUrl ? (
          <img
            src={receipt.logoUrl}
            alt=""
            className="mx-auto mb-1"
            style={{ maxWidth: '18mm', maxHeight: '18mm' }}
          />
        ) : null}
        <div className="font-bold" style={{ fontSize: small ? '11pt' : '13pt' }}>
          {receipt.businessName}
        </div>
        {receipt.address ? <div>{receipt.address}</div> : null}
        {receipt.phone ? <div>{receipt.phone}</div> : null}
        {receipt.voided ? (
          <div className="mt-1 font-bold">VOID: this order was cancelled</div>
        ) : null}
      </header>
      <hr className="my-2 border-dashed border-black" />
      <dl className="grid grid-cols-[auto_1fr] gap-x-2">
        <dt>Receipt</dt>
        <dd className="text-right font-semibold">{receipt.orderNumber}</dd>
        <dt>Date</dt>
        <dd className="text-right">{receipt.dateTime}</dd>
        <dt>Served by</dt>
        <dd className="text-right">{receipt.staffName}</dd>
        {receipt.customerName ? (
          <>
            <dt>Customer</dt>
            <dd className="text-right">{receipt.customerName}</dd>
          </>
        ) : null}
      </dl>
      <hr className="my-2 border-dashed border-black" />
      <table className="w-full">
        <thead className="sr-only">
          <tr>
            <th>Item</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          {receipt.lines.map((line, index) => (
            <tr key={index} className="align-top">
              <td className="pb-1">
                <div>{line.name}</div>
                <div className="tabular-nums" style={{ fontSize: '0.85em' }}>
                  {line.quantity} × {line.unitPrice}
                </div>
              </td>
              <td className="pb-1 pl-2 text-right font-semibold whitespace-nowrap tabular-nums">
                {line.lineTotal}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <hr className="my-2 border-dashed border-black" />
      <div className="flex justify-between font-bold" style={{ fontSize: '1.3em' }}>
        <span>Total</span>
        <span className="tabular-nums">{receipt.total}</span>
      </div>
      <div className="flex justify-between">
        <span>Paid by</span>
        <span className="text-right">
          {receipt.paymentMethod}
          {receipt.paymentReference ? ` · ${receipt.paymentReference}` : ''}
        </span>
      </div>
      {receipt.footer ? (
        <>
          <hr className="my-2 border-dashed border-black" />
          <p className="text-center">{receipt.footer}</p>
        </>
      ) : null}
      <p className="mt-3 text-center" style={{ fontSize: '0.8em' }}>
        Powered by Tallybox
      </p>
    </article>
  )
}

/**
 * Puts the receipt in a print-only layer, opens the print dialog, and cleans up
 * afterwards. Everything else on the page is hidden while printing.
 */
export function PrintJob({
  receipt,
  paper,
  onDone,
}: {
  receipt: ReceiptData
  paper: Paper
  onDone: () => void
}) {
  useLayoutEffect(() => {
    const style = document.createElement('style')
    style.id = 'print-page'
    style.textContent = PAGE_RULE[paper]
    document.head.append(style)
    document.documentElement.classList.add('printing-receipt')
    return () => {
      style.remove()
      document.documentElement.classList.remove('printing-receipt')
    }
  }, [paper])

  useEffect(() => {
    const finish = () => onDone()
    window.addEventListener('afterprint', finish, { once: true })
    // Let the receipt render (and its logo load) before the dialog opens.
    // The print layer is invisible on screen, so if a browser never sends
    // afterprint, leaving it in place until the next print does no harm.
    const timer = window.setTimeout(() => window.print(), 150)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('afterprint', finish)
    }
  }, [onDone])

  return createPortal(<ReceiptDocument receipt={receipt} paper={paper} />, printRoot())
}
