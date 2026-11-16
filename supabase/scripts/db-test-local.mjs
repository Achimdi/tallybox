// Runs the database migrations and pgTAP tests in an in-memory Postgres (PGlite).
//
//   npm run db:test:local
//
// No Docker and no Supabase account needed, and nothing leaves your machine.
// CI runs the same test files against a real Supabase stack (`npm run db:test`).

import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { pgtap } from '@electric-sql/pglite-pgtap'

const supabaseDir = join(dirname(fileURLToPath(import.meta.url)), '..')
const migrationsDir = join(supabaseDir, 'migrations')
const testsDir = join(supabaseDir, 'tests')
const only = process.argv[2] // optional: part of a test file name

function sqlFiles(dir) {
  return readdirSync(dir)
    .filter((name) => name.endsWith('.sql'))
    .sort()
}

function read(...parts) {
  return readFileSync(join(...parts), 'utf8')
}

/** Every text value returned by a multi-statement run is a line of TAP output. */
function tapLines(results) {
  const lines = []
  for (const result of results) {
    for (const row of result.rows ?? []) {
      for (const value of Object.values(row)) {
        if (typeof value === 'string') lines.push(...value.split('\n'))
      }
    }
  }
  return lines
}

const db = new PGlite({ extensions: { pgtap } })

await db.exec(read(supabaseDir, 'scripts', 'local-supabase-stubs.sql'))
await db.exec(`set search_path to "$user", public, extensions`)

for (const file of sqlFiles(migrationsDir)) {
  try {
    await db.exec(read(migrationsDir, file))
  } catch (error) {
    console.error(`\nMigration failed: ${file}\n  ${error.message}`)
    process.exit(1)
  }
}
console.log(`Applied ${sqlFiles(migrationsDir).length} migrations.\n`)

let passed = 0
let failed = 0

for (const file of sqlFiles(testsDir)) {
  // The setup file installs pgTAP and the helpers, so it always runs.
  if (only && !file.includes(only) && !file.startsWith('000_')) continue

  const problems = []
  let okCount = 0
  let planned = null

  try {
    const lines = tapLines(await db.exec(read(testsDir, file)))
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index]
      const plan = /^1\.\.(\d+)/.exec(line)
      if (plan) planned = Number(plan[1])
      else if (/^ok\b/.test(line)) okCount += 1
      else if (/^not ok\b/.test(line)) {
        const details = []
        while (lines[index + 1]?.startsWith('#')) details.push(lines[(index += 1)])
        problems.push([line, ...details].join('\n      '))
      }
    }
    if (planned === null) problems.push('No test plan found (missing "select plan(n)").')
    else if (problems.length === 0 && okCount !== planned) {
      problems.push(`Planned ${planned} tests but ran ${okCount}.`)
    }
  } catch (error) {
    problems.push(`SQL error: ${error.message}`)
  } finally {
    // Leave no open transaction or assumed role behind for the next file.
    await db.exec('rollback; reset role;').catch(() => undefined)
    await db.exec(`select set_config('request.jwt.claims', '', false)`).catch(() => undefined)
    // pgTAP keeps its counters in temporary tables. Each file gets a fresh set,
    // as it would in its own connection.
    await db
      .exec(
        'drop table if exists __tcache__, __tresults__; ' +
          'drop sequence if exists __tcache___id_seq, __tresults___numb_seq;',
      )
      .catch(() => undefined)
  }

  if (problems.length === 0) {
    passed += 1
    console.log(`  ok    ${file} (${okCount} tests)`)
  } else {
    failed += 1
    console.log(`  FAIL  ${file}`)
    for (const problem of problems) console.log(`      ${problem}`)
  }
}

console.log(`\n${passed} test files passed, ${failed} failed.`)
await db.close()
process.exitCode = failed === 0 ? 0 : 1
