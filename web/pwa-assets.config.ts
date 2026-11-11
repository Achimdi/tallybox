import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config'

const TEAL = '#0E7C7B'

/**
 * Generates the PNG and ICO icons from the one SVG source.
 * Run `npm run icons -w web` after replacing public/brand/icon.svg.
 */
export default defineConfig({
  preset: {
    ...minimal2023Preset,
    // The source icon is already full-bleed teal, so no extra padding.
    transparent: { ...minimal2023Preset.transparent, padding: 0 },
    // Maskable icons get cropped to circles and squircles, so keep a safe margin.
    maskable: {
      ...minimal2023Preset.maskable,
      padding: 0.1,
      resizeOptions: { background: TEAL, fit: 'contain' },
    },
    apple: {
      ...minimal2023Preset.apple,
      padding: 0,
      resizeOptions: { background: TEAL, fit: 'contain' },
    },
  },
  images: ['public/brand/icon.svg'],
})
