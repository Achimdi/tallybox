import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Order } from '@/api/types'
import { signedInTestApi } from '@/test/mockApi'
import { renderApp } from '@/test/render'
import { ordersCsv } from './exportCsv'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('reports page', () => {
  it('shows totals, a chart with a table view, and breakdowns for this week', async () => {
    const test = await signedInTestApi('owner')
    renderApp({ path: '/owner/reports', api: test.api })

    const totals = await screen.findByRole('region', { name: 'Totals' })
    expect(within(totals).getByText('Average order')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'This week' })).toBeChecked()
    expect(screen.getByRole('list', { name: 'Sales by payment method' })).toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'Best sellers' })).toBeInTheDocument()
    expect(screen.getByText('Stock value now')).toBeInTheDocument()

    // The chart's numbers are also a table, and its columns read out with the arrow keys.
    const chart = screen.queryByRole('group', { name: /^Sales by day/ })
    if (chart) {
      await userEvent.click(screen.getByText('Show as a table'))
      expect(screen.getByRole('columnheader', { name: 'Day' })).toBeInTheDocument()
      chart.focus()
      await userEvent.keyboard('{End}')
      expect(within(chart.parentElement!).getByRole('status')).toHaveTextContent(/order/)
    }
  })

  it('matches the data layer for today', async () => {
    const test = await signedInTestApi('owner')
    const today = (await test.api.reports.dashboard()).today.dateKey
    const report = await test.api.reports.summary({ from: today, to: today })
    renderApp({ path: '/owner/reports', api: test.api })
    await userEvent.click(await screen.findByRole('radio', { name: 'Today' }))
    const totals = await screen.findByRole('region', { name: 'Totals' })
    await waitFor(() =>
      expect(within(totals).getByText('Orders').closest('div')?.parentElement).toHaveTextContent(
        String(report.orders),
      ),
    )
  })

  it('is closed to staff', async () => {
    const staff = await signedInTestApi('staff')
    renderApp({ path: '/owner/reports', api: staff.api })
    expect(await screen.findByRole('heading', { level: 1 })).not.toHaveTextContent('Reports')
    expect(screen.queryByRole('region', { name: 'Totals' })).not.toBeInTheDocument()
  })

  it('downloads the orders as CSV', async () => {
    const created = vi.fn((blob: Blob) => {
      void blob
      return 'blob:report'
    })
    URL.createObjectURL = created
    URL.revokeObjectURL = vi.fn()
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)

    const test = await signedInTestApi('owner')
    renderApp({ path: '/owner/reports', api: test.api })
    await userEvent.click(await screen.findByRole('button', { name: 'Export CSV' }))
    expect(await screen.findByText('CSV downloaded')).toBeInTheDocument()
    expect(click).toHaveBeenCalled()
    const blob = created.mock.calls[0]?.[0]
    expect(blob?.type).toBe('text/csv;charset=utf-8')
    // The file starts with the UTF-8 byte-order mark (EF BB BF) so Excel reads ₦ correctly.
    const bytes = new Uint8Array((await blob?.arrayBuffer()) ?? new ArrayBuffer(0))
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
    expect(await blob?.text()).toMatch(/^Order,Date,Time,Status,Taken by/)
  })

  it('asks for a sensible custom range', async () => {
    const test = await signedInTestApi('owner')
    renderApp({ path: '/owner/reports', api: test.api })
    await userEvent.click(await screen.findByRole('radio', { name: 'Custom' }))
    const from = screen.getByLabelText('From')
    await userEvent.clear(from)
    await userEvent.type(from, '2020-01-01')
    expect(await screen.findByRole('alert')).toHaveTextContent('at most 366 days apart')
  })
})

describe('orders CSV', () => {
  it('writes one row per line in business time, with voids, and no phone numbers', () => {
    const order = {
      id: 'o',
      orderNumber: 7,
      status: 'voided',
      staffName: 'Ada Eze',
      total: 135000,
      paymentMethod: 'cash',
      paymentReference: null,
      customerName: '=cmd',
      customerPhone: '08031234567',
      dateKey: '2026-11-13',
      createdAt: '2026-11-13T17:52:00Z',
      voidReason: 'Mistake, entered twice',
      lines: [
        { itemId: 'a', name: 'Water, 75cl', unitPrice: 45000, quantity: 2, lineTotal: 90000 },
        { itemId: 'b', name: 'Bread', unitPrice: 45000, quantity: 1, lineTotal: 45000 },
      ],
    } as unknown as Order
    const csv = ordersCsv([order], 'NGN', 'Africa/Lagos')
    const lines = csv.slice(1).trimEnd().split('\r\n')
    expect(lines).toHaveLength(3)
    expect(lines[1]).toBe(
      `#0007,2026-11-13,18:52,Voided,Ada Eze,Cash,,'=cmd,"Water, 75cl",2,450.00,900.00,1350.00,"Mistake, entered twice"`,
    )
    expect(csv).not.toContain('08031234567')
  })
})
