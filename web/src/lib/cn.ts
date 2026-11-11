import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

// Teach tailwind-merge about our custom token names, so that for example
// `text-title` (a size) and `text-ink` (a color) are not treated as a conflict.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ['display', 'title-lg', 'title', 'body-lg', 'body', 'label', 'caption'],
      radius: ['control', 'card'],
      shadow: ['soft', 'raised'],
    },
  },
})

/** Joins class names and resolves conflicting Tailwind classes (last one wins). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
