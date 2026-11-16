export const MAX_BODY_BYTES = 32 * 1024

export type BodyResult = { ok: true; value: unknown } | { ok: false; status: 400 | 413 }

/** Reads a JSON body, rejecting anything over MAX_BODY_BYTES (declared Content-Length and actual size). */
export async function readJsonBody(req: Request): Promise<BodyResult> {
  const declared = Number(req.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return { ok: false, status: 413 }
  let text: string
  try {
    text = await req.text()
  } catch {
    return { ok: false, status: 400 }
  }
  if (text.length > MAX_BODY_BYTES || new TextEncoder().encode(text).length > MAX_BODY_BYTES) return { ok: false, status: 413 }
  try {
    return { ok: true, value: JSON.parse(text) }
  } catch {
    return { ok: false, status: 400 }
  }
}
