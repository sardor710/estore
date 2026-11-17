'use server'

import { revalidatePath } from 'next/cache'
import { requirePermission } from '@/lib/admin/session'
import { logActivity } from '@/lib/admin/activity'
import { deletePost, loadPostInput, savePost, type BlogPostInput, type SaveResult, type SimpleResult } from '@/lib/admin/blog'
import { translateBlogPost, TranslationError } from '@/lib/translate'

// 'blog' permission; savePost/deletePost validate, sanitize and write the activity log.
// Blog pages are rendered per request, so refreshing the router cache is all that is needed.

function refreshStorefront() {
  revalidatePath('/', 'layout')
}

export async function savePostAction(id: number | null, input: BlogPostInput): Promise<SaveResult> {
  const staff = await requirePermission('blog')
  const r = await savePost(id, input, staff)
  if (r.ok) refreshStorefront()
  return r
}

export async function deletePostAction(id: number): Promise<SimpleResult> {
  const staff = await requirePermission('blog')
  const r = await deletePost(id, staff)
  if (r.ok) refreshStorefront()
  return r
}

export type TranslatePostResult =
  | { ok: true; status: 'done' | 'not_configured'; translated: number; fresh: BlogPostInput | null }
  | { ok: false; message: string }

export async function translatePostAction(id: number, force: boolean): Promise<TranslatePostResult> {
  const staff = await requirePermission('blog')
  if (!Number.isInteger(id)) return { ok: false, message: 'Post not found.' }
  try {
    const r = await translateBlogPost(id, { force })
    if (r.status === 'done') {
      if (r.translated > 0) await logActivity(staff, 'update', 'post', id, `Machine-translated ${r.translated} field(s) of post #${id}`)
      refreshStorefront()
    }
    return { ok: true, status: r.status, translated: r.translated, fresh: await loadPostInput(id) }
  } catch (e) {
    return { ok: false, message: e instanceof TranslationError || e instanceof Error ? e.message : 'Translation failed.' }
  }
}
