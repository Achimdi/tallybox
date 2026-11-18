import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { BusinessSettings, Order } from '@/api/types'
import { DEFAULT_WATERMARK } from '@/domain/receiptWatermark'
import { signedInTestApi } from '@/test/mockApi'
import { renderApp } from '@/test/render'
import {
  buildReceipt,
  receiptFileName,
  receiptMessage,
  whatsAppChatUrl,
  whatsAppNumber,
} from './receipt'

const settings: BusinessSettings = {
  id: 'b',
  name: 'Sunrise Pharmacy',
  businessCode: 'sunrise-demo',
  currencyCode: 'NGN',
  timezone: 'Africa/Lagos',
  address: '12 Example Street',
  phone: '0801 000 0001',
  receiptFooter: 'Get well soon',
  defaultLowStockLevel: 5,
  logoUrl: null,
  watermark: DEFAULT_WATERMARK,
  accessEndsAt: null,
}

const order: Order = {
  id: 'o',
  orderNumber: 48,
  status: 'completed',
  staffId: 's',
  staffName: 'Ada Eze',
  total: 135000,
  paymentMethod: 'bank_transfer',
  paymentReference: 'TRF-991',
  paymentConfirmedByName: 'Ada Eze',
  paymentConfirmedAt: '2026-11-13T17:52:00Z',
  customerName: 'Chioma',
  customerPhone: '0803 123 4567',
  note: null,
  dateKey: '2026-11-13',
  createdAt: '2026-11-13T17:52:00Z',
  voidedAt: null,
  voidedByName: null,
  voidReason: null,
  lines: [
    { itemId: 'a', name: 'Paracetamol 500mg', unitPrice: 45000, quantity: 2, lineTotal: 90000 },
    { itemId: 'b', name: 'Antacid tablets', unitPrice: 45000, quantity: 1, lineTotal: 45000 },
  ],
}

describe('receipt content', () => {
  it('formats everything printed on the receipt from the order snapshot', () => {
    const receipt = buildReceipt(order, settings)
    expect(receipt).toMatchObject({
      businessName: 'Sunrise Pharmacy',
      orderNumber: '#0048',
      staffName: 'Ada Eze',
      itemCount: 3,
      total: '₦1,350.00',
      paymentMethod: 'Bank transfer',
      paymentReference: 'TRF-991',
      customerName: 'Chioma',
      footer: 'Get well soon',
      voided: false,
      watermark: { kind: 'tallybox', text: 'Tallybox' },
    })
    expect(receipt.dateTime).toMatch(/Nov.*2026.*6:52/)
    expect(receipt.lines[0]).toEqual({
      name: 'Paracetamol 500mg',
      quantity: 2,
      unitPrice: '₦450.00',
      lineTotal: '₦900.00',
    })
  })

  it("carries the owner's own watermark, or none", () => {
    const logoUrl = 'data:image/png;base64,AAAA'
    const own = {
      ...settings,
      logoUrl,
      watermark: { kind: 'custom' as const, text: 'Sunrise', useLogo: true },
    }
    expect(buildReceipt(order, own).watermark).toEqual({
      kind: 'custom',
      text: 'Sunrise',
      logoUrl,
    })
    // The logo stays at the top too.
    expect(buildReceipt(order, own).logoUrl).toBe(logoUrl)
    const none = { ...settings, watermark: { kind: 'none' as const, text: null, useLogo: false } }
    expect(buildReceipt(order, none).watermark).toBeNull()
  })

  it('marks a voided order and names its files', () => {
    const receipt = buildReceipt({ ...order, status: 'voided' }, settings)
    expect(receipt.voided).toBe(true)
    expect(receiptFileName(receipt, 'pdf')).toBe('sunrise-pharmacy-receipt-0048-void.pdf')
    expect(receiptFileName(buildReceipt(order, settings), 'png')).toBe(
      'sunrise-pharmacy-receipt-0048.png',
    )
    expect(receiptMessage(receipt)).toContain('receipt #0048 (VOID)')
  })

  it('writes a short WhatsApp message with the lines and total', () => {
    expect(receiptMessage(buildReceipt(order, settings))).toBe(
      [
        'Sunrise Pharmacy: receipt #0048',
        buildReceipt(order, settings).dateTime,
        '',
        '2 × Paracetamol 500mg: ₦900.00',
        '1 × Antacid tablets: ₦450.00',
        '',
        'Total: ₦1,350.00 (Bank transfer)',
        '',
        'Get well soon',
      ].join('\n'),
    )
  })
})

describe('WhatsApp numbers', () => {
  it('turns local numbers into international ones by the business currency', () => {
    expect(whatsAppNumber('0803 123 4567', 'NGN')).toBe('2348031234567')
    expect(whatsAppNumber('024 412 3456', 'GHS')).toBe('233244123456')
    expect(whatsAppNumber('+44 7700 900123', 'NGN')).toBe('447700900123')
    expect(whatsAppNumber('00234 803 123 4567', 'USD')).toBe('2348031234567')
  })

  it("gives up when it can't be sure", () => {
    expect(whatsAppNumber('0803 123 4567', 'USD')).toBeNull()
    expect(whatsAppNumber('12345', 'NGN')).toBeNull()
    expect(whatsAppNumber('call me', 'NGN')).toBeNull()
  })

  it('builds a chat link with the message encoded', () => {
    expect(whatsAppChatUrl('2348031234567', 'Total: ₦900 & thanks')).toBe(
      'https://wa.me/2348031234567?text=Total%3A%20%E2%82%A6900%20%26%20thanks',
    )
  })
})

describe('receipt actions on an order', () => {
  it('offers share, WhatsApp to the customer, PDF, image and print', async () => {
    const test = await signedInTestApi('staff')
    const [item] = await test.api.items.list()
    const created = await test.api.orders.create({
      clientOrderId: crypto.randomUUID(),
      lines: [{ itemId: item!.id, quantity: 1 }],
      paymentMethod: 'cash',
      paymentReference: '',
      paymentConfirmed: true,
      customerName: 'Chioma',
      customerPhone: '0803 123 4567',
      note: '',
    })
    renderApp({ path: `/staff/orders/${created.id}/done`, api: test.api })

    expect(await screen.findByRole('button', { name: 'Share receipt' })).toBeInTheDocument()
    const whatsapp = screen.getByRole('link', { name: 'Send on WhatsApp' })
    expect(whatsapp.getAttribute('href')).toMatch(/^https:\/\/wa\.me\/2348031234567\?text=/)
    expect(whatsapp).toHaveAttribute('rel', 'noopener noreferrer')
    for (const name of ['PDF', 'image', 'Print']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument()
    }
  })

  it('says so when a receipt cannot be made, and the order stays saved', async () => {
    const test = await signedInTestApi('staff')
    const [item] = await test.api.items.list()
    const created = await test.api.orders.create({
      clientOrderId: crypto.randomUUID(),
      lines: [{ itemId: item!.id, quantity: 1 }],
      paymentMethod: 'cash',
      paymentReference: '',
      paymentConfirmed: true,
      customerName: '',
      customerPhone: '',
      note: '',
    })
    renderApp({ path: `/staff/orders/${created.id}`, api: test.api })
    const receipt = await screen.findByRole('region', { name: 'Receipt' })
    expect(
      await within(receipt).findByRole('link', { name: 'Share on WhatsApp' }),
    ).toBeInTheDocument()
    // The test browser has no canvas, so making the image fails politely.
    await userEvent.click(within(receipt).getByRole('button', { name: 'PDF' }))
    expect(await screen.findByText("The receipt couldn't be made")).toBeInTheDocument()
  })
})
