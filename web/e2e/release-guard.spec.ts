import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'

/**
 * A build for real clients must refuse to use demo data: client records kept
 * only in one browser would be lost. This runs a real production build with
 * VITE_RELEASE=client and no real backend, and expects it to fail.
 */
test('a client release cannot be built on demo data', () => {
  test.skip(test.info().project.name !== 'desktop', 'A build check: running it once is enough.')
  test.setTimeout(180_000)
  const outDir = mkdtempSync(join(tmpdir(), 'tallybox-guard-'))
  try {
    const result = spawnSync('npx', ['vite', 'build', '--outDir', outDir], {
      cwd: fileURLToPath(new URL('..', import.meta.url)),
      env: { ...process.env, VITE_RELEASE: 'client', VITE_DATA_SOURCE: 'mock' },
      encoding: 'utf8',
      shell: process.platform === 'win32',
    })
    expect(result.status).not.toBe(0)
    expect(`${result.stdout}${result.stderr}`).toContain('A client release cannot use demo data')
  } finally {
    rmSync(outDir, { recursive: true, force: true })
  }
})
