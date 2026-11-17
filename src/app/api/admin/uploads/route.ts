import { NextResponse } from 'next/server'
import { adminApi } from '@/lib/admin/api'
import { saveUpload } from '@/lib/uploads'

export const runtime = 'nodejs'

const fail = (message: string, status: number) => NextResponse.json({ error: { message } }, { status })

/** CKEditor Simple Upload Adapter contract: multipart field `upload` → `{ url }` or `{ error: { message } }`. */
export const POST = adminApi(['catalog', 'blog'], async (req) => {
  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return fail('Invalid upload request', 400)
  }
  const file = form.get('upload')
  if (!(file instanceof File)) return fail('No file received', 400)
  const saved = await saveUpload(file)
  if (!saved.ok) return fail(saved.error, saved.error.includes('5 MB') ? 413 : 400)
  return NextResponse.json({ url: saved.url })
})
