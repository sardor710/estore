import { execSync } from 'node:child_process'
import { rmSync } from 'node:fs'

// Fresh throwaway SQLite file for every test run, schema pushed from prisma/schema.prisma.
export default function setup() {
  for (const f of ['test.db', 'test.db-journal']) rmSync(f, { force: true })
  execSync('npx prisma db push', {
    stdio: 'pipe',
    env: { ...process.env, DATABASE_URL: 'file:./test.db' },
  })
}
