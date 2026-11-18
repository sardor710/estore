// Daily backup (run by the zanko-backup.timer systemd unit): a consistent SQLite copy of the live database
// (better-sqlite3 online backup, safe while the shop is running) and a copy of new uploaded files.
// Keeps the last KEEP_DAYS database copies. Usage: node scripts/backup.mjs
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'

const require = createRequire(import.meta.url)
const Database = require('../node_modules/@prisma/adapter-better-sqlite3/node_modules/better-sqlite3')

const DATA = process.env.ZANKO_DATA || '/home/nick/zanko-data'
const DB = join(DATA, 'zanko.db')
const DIR = join(DATA, 'backups')
const KEEP_DAYS = Number(process.env.KEEP_DAYS || 30)

mkdirSync(DIR, { recursive: true })
const stamp = new Date().toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-')
const out = join(DIR, `zanko-${stamp}.db`)

const db = new Database(DB, { readonly: true, fileMustExist: true })
await db.backup(out)
db.close()
// Check the copy opens and is intact before trusting it.
const check = new Database(out, { readonly: true })
const ok = check.pragma('integrity_check', { simple: true })
check.close()
if (ok !== 'ok') throw new Error(`Backup ${out} failed integrity_check: ${ok}`)

// Uploads are content-addressed and never edited: copy new files, never delete from the backup.
execFileSync('rsync', ['-a', `${join(DATA, 'uploads')}/`, `${join(DIR, 'uploads')}/`])

const cutoff = Date.now() - KEEP_DAYS * 86_400_000
let removed = 0
for (const f of readdirSync(DIR)) {
  if (!/^zanko-\d{8}-\d{4}\.db$/.test(f)) continue
  if (statSync(join(DIR, f)).mtimeMs < cutoff) {
    rmSync(join(DIR, f))
    removed++
  }
}
console.log(`backup ok: ${out} (${statSync(out).size} bytes), removed ${removed} older than ${KEEP_DAYS} days`)
