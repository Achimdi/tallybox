import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { BackLink } from '@/components/BackLink'

const TOPICS: readonly { question: string; answer: ReactNode }[] = [
  {
    question: 'How does stock go up and down?',
    answer:
      'Stock goes down when an order is confirmed and goes back up if you void it. A delivery (Restock) adds to it. If your count on the shelf is different, use Adjust stock on the item and give a reason. Every change is kept in the stock ledger and can never be edited.',
  },
  {
    question: 'When is an order confirmed?',
    answer:
      'Only after the person selling ticks "Payment received". Tallybox does not take payments: you check the cash, the transfer or the card machine yourself. Until then the order can be held, and a held order takes no stock.',
  },
  {
    question: 'What does voiding an order do?',
    answer:
      'It cancels a confirmed order, for example a mistake or a refund. Its items go back into stock and the order stays on record, marked voided, with your reason. Only you, the owner, can void.',
  },
  {
    question: 'What can staff see?',
    answer:
      'Staff take orders, hold and resume them, see their own orders for today and check what is in stock. They never see sales totals, cost prices, reports or settings.',
  },
  {
    question: 'A staff member forgot their password',
    answer:
      'Open More, then Staff, choose the person and set a new temporary password. Tell them in person; they can change it after signing in.',
  },
  {
    question: 'Someone has left',
    answer:
      'Turn their account off from More, then Staff. They are signed out and cannot sign in again. Their past orders are kept.',
  },
  {
    question: 'Why does Tallybox need the internet?',
    answer:
      'Every sale is checked against the latest stock on the server, so two people can never sell the last item twice. When you are offline, Tallybox tells you and waits.',
  },
  {
    question: 'My access is ending',
    answer:
      'Contact the person who set up Tallybox for you. When access ends there are a few days of grace, then nobody in the business can sign in until it is extended. Your data is kept.',
  },
]

/** Short answers to the questions owners ask most. */
export default function HelpPage() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
      <BackLink to="/owner/more" label="More" />
      <h1 className="text-title-lg text-ink">Help</h1>
      <div className="flex flex-col gap-3">
        {TOPICS.map((topic) => (
          <details
            key={topic.question}
            className="group rounded-card border border-line bg-surface-raised shadow-soft"
          >
            <summary className="flex min-h-14 cursor-pointer items-center px-4 py-3 text-body font-medium text-ink">
              {topic.question}
            </summary>
            <p className="px-4 pb-4 text-body text-ink-muted">{topic.answer}</p>
          </details>
        ))}
      </div>
      <p className="text-body text-ink-muted">
        Still stuck? See{' '}
        <Link to="/support" className="font-semibold text-primary underline">
          Support
        </Link>{' '}
        to reach us, and{' '}
        <Link to="/privacy" className="font-semibold text-primary underline">
          Privacy
        </Link>{' '}
        for how your information is looked after.
      </p>
    </div>
  )
}
