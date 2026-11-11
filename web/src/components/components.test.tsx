import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Button } from './Button'
import { CartBar } from './CartBar'
import { ItemCard } from './ItemCard'
import { QuantityStepper } from './QuantityStepper'
import { ErrorState } from './states'
import { StatusChip } from './StatusChip'
import { TextField } from './TextField'

describe('Button', () => {
  it('calls onClick', async () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Save</Button>)
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('blocks taps while loading, which guards against double taps', async () => {
    const onClick = vi.fn()
    render(
      <Button loading loadingLabel="Saving…" onClick={onClick}>
        Save
      </Button>,
    )
    const button = screen.getByRole('button', { name: 'Saving…' })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')
    await userEvent.click(button)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('defaults to type="button" so it never submits a form by accident', () => {
    render(<Button>Save</Button>)
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button')
  })
})

describe('TextField', () => {
  it('links the label, hint and error to the input', () => {
    render(<TextField label="Item name" hint="As shown on the shelf" error="Enter a name" />)
    const input = screen.getByLabelText('Item name')
    expect(input).toBeInvalid()
    expect(input).toHaveAccessibleDescription('Enter a name As shown on the shelf')
  })

  it('is valid when there is no error', () => {
    render(<TextField label="Item name" />)
    expect(screen.getByLabelText('Item name')).toBeValid()
  })
})

describe('QuantityStepper', () => {
  it('steps up and down', async () => {
    const onChange = vi.fn()
    render(<QuantityStepper value={2} onChange={onChange} label="Quantity" />)
    await userEvent.click(screen.getByRole('button', { name: 'Increase' }))
    await userEvent.click(screen.getByRole('button', { name: 'Decrease' }))
    expect(onChange).toHaveBeenNthCalledWith(1, 3)
    expect(onChange).toHaveBeenNthCalledWith(2, 1)
  })

  it('stops at the minimum and at the stock on hand', () => {
    const { rerender } = render(
      <QuantityStepper value={0} onChange={vi.fn()} label="Quantity" max={3} />,
    )
    expect(screen.getByRole('button', { name: 'Decrease' })).toBeDisabled()
    rerender(<QuantityStepper value={3} onChange={vi.fn()} label="Quantity" max={3} />)
    expect(screen.getByRole('button', { name: 'Increase' })).toBeDisabled()
  })
})

describe('ItemCard', () => {
  const base = { name: 'Bottled water', price: 25000, currency: 'NGN', lowStockLevel: 5 }

  it('shows price and stock, and adds on tap', async () => {
    const onAdd = vi.fn()
    render(<ItemCard {...base} quantity={20} onAdd={onAdd} />)
    expect(screen.getByText('₦250.00')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Add Bottled water' }))
    expect(onAdd).toHaveBeenCalledOnce()
  })

  it('flags low stock in words, not just color', () => {
    render(<ItemCard {...base} quantity={3} onAdd={vi.fn()} />)
    expect(screen.getByText('Low: 3 left')).toBeInTheDocument()
  })

  it('cannot be tapped when out of stock', async () => {
    const onAdd = vi.fn()
    render(<ItemCard {...base} quantity={0} onAdd={onAdd} />)
    const card = screen.getByRole('button', { name: 'Add Bottled water' })
    expect(card).toBeDisabled()
    expect(screen.getByText('Out of stock')).toBeInTheDocument()
    await userEvent.click(card)
    expect(onAdd).not.toHaveBeenCalled()
  })

  it('cannot add more than the stock on hand', () => {
    render(<ItemCard {...base} quantity={2} inCart={2} onAdd={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Add Bottled water' })).toBeDisabled()
  })
})

describe('CartBar', () => {
  it('shows the count and total', () => {
    render(<CartBar itemCount={3} total={125050} currency="NGN" onOpen={vi.fn()} />)
    expect(screen.getByRole('button')).toHaveTextContent('3 items')
    expect(screen.getByRole('button')).toHaveTextContent('₦1,250.50')
  })

  it('is hidden while the cart is empty', () => {
    const { container } = render(
      <CartBar itemCount={0} total={0} currency="NGN" onOpen={vi.fn()} />,
    )
    expect(container).toBeEmptyDOMElement()
  })
})

describe('StatusChip', () => {
  it('always carries a word and an icon', () => {
    const { container } = render(<StatusChip status="voided" />)
    expect(screen.getByText('Voided')).toBeInTheDocument()
    expect(container.querySelector('svg')).not.toBeNull()
  })
})

describe('ErrorState', () => {
  it('shows a friendly message and never the raw error', () => {
    render(<ErrorState error={new Error('relation "orders" does not exist')} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong')
    expect(screen.queryByText(/relation/)).not.toBeInTheDocument()
  })

  it('offers a retry when one is possible', async () => {
    const onRetry = vi.fn()
    render(<ErrorState error={new Error('x')} onRetry={onRetry} />)
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(onRetry).toHaveBeenCalledOnce()
  })
})
