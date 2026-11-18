import { NextResponse } from 'next/server'
import { adminApi } from '@/lib/admin/api'
import { logActivity } from '@/lib/admin/activity'
import { MAX_MESSAGE_VIDEO_BYTES, saveMessageMedia } from '@/lib/uploads'

export const runtime = 'nodejs'

const fail = (message: string, status: number) => NextResponse.json({ error: message }, { status })

/** Attachment for an admin -> customer message: multipart field `file` (photo, GIF or MP4) -> `{ url, kind }`. */
export const POST = adminApi('clients', async (req, _ctx, staff) => {
  const declared = Number(req.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > MAX_MESSAGE_VIDEO_BYTES + 1024 * 1024) return fail('File is larger than 50 MB', 413)
  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return fail('Invalid upload request', 400)
  }
  const file = form.get('file')
  if (!(file instanceof File)) return fail('No file received', 400)
  const saved = await saveMessageMedia(file)
  if (!saved.ok) return fail(saved.error, saved.tooBig ? 413 : 400)
  await logActivity(staff, 'create', 'upload', null, saved.url)
  return NextResponse.json({ url: saved.url, kind: saved.kind })
})
