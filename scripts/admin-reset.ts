import 'dotenv/config'
import { createInterface } from 'node:readline'
import { prisma } from '../src/lib/db'
import { hashPassword } from '../src/lib/password'
import { MIN_PASSWORD_LENGTH } from '../src/lib/auth'
import { normalizeEmail } from '../src/lib/admin/users'
import { logActivity } from '../src/lib/admin/activity'

// Lock-out recovery from the server shell (no web backdoor):
//   npm run admin:reset -- <email> [--name "Full Name"]
// Creates the account as a full admin, or resets an existing one: role ADMIN, active, new password,
// and a sessionVersion bump that signs out every existing session of that account.

function parseArgs(argv: string[]): { email: string; name?: string } | null {
  let email: string | undefined
  let name: string | undefined
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--name') name = argv[++i]
    else if (!email) email = argv[i]
  }
  return email ? { email, name } : null
}

function prompter() {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY })
  let muted = false
  // Hide typed characters while a password is being entered (only the prompt itself is echoed).
  const out = rl as unknown as { _writeToOutput: (s: string) => void }
  const write = out._writeToOutput.bind(rl)
  out._writeToOutput = (s: string) => {
    if (!muted || s.includes('password')) write(s)
  }
  const lines: string[] = []
  const waiters: ((s: string) => void)[] = []
  rl.on('line', (l) => (waiters.length ? waiters.shift()!(l) : lines.push(l)))
  return {
    askHidden(q: string): Promise<string> {
      muted = true
      process.stdout.write(q)
      return new Promise((resolve) => {
        const done = (l: string) => {
          muted = false
          process.stdout.write('\n')
          resolve(l)
        }
        if (lines.length) done(lines.shift()!)
        else waiters.push(done)
      })
    },
    close: () => rl.close(),
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (!args) {
    console.error('usage: npm run admin:reset -- <email> [--name "Full Name"]')
    process.exit(2)
  }
  const email = normalizeEmail(args.email)
  const existing = await prisma.adminUser.findUnique({ where: { email } })
  if (!existing && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error(`No account "${email}" exists, and a new account needs a valid email address.`)
    process.exit(2)
  }

  const p = prompter()
  const pw = await p.askHidden(`New password for ${email} (min ${MIN_PASSWORD_LENGTH} chars): `)
  const again = await p.askHidden('Repeat the password: ')
  p.close()
  if (pw !== again) {
    console.error('The passwords do not match. Nothing changed.')
    process.exit(1)
  }
  if (pw.length < MIN_PASSWORD_LENGTH) {
    console.error(`The password must be at least ${MIN_PASSWORD_LENGTH} characters. Nothing changed.`)
    process.exit(1)
  }

  const passwordHash = await hashPassword(pw)
  const name = args.name?.trim()
  const user = existing
    ? await prisma.adminUser.update({
        where: { id: existing.id },
        data: { role: 'ADMIN', active: true, passwordHash, sessionVersion: { increment: 1 }, ...(name ? { name } : {}) },
      })
    : await prisma.adminUser.create({ data: { email, name: name || email, role: 'ADMIN', active: true, passwordHash } })

  await logActivity(
    { id: 0, email: 'cli:admin-reset', name: 'Server CLI', role: 'ADMIN' },
    existing ? 'update' : 'create',
    'user',
    user.id,
    existing ? `Reset ${email} to an active full admin with a new password (CLI)` : `Created full admin ${email} (CLI)`,
  )
  console.log(existing ? `OK: ${email} is an active full admin with the new password; old sessions are signed out.` : `OK: created full admin ${email}.`)
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
