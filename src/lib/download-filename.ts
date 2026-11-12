/** Safe filename for browser download surfaces and response headers. */
export function sanitizeDownloadFilename(name: string): string {
  const base = name.trim() || 'document'
  return base.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').slice(0, 255)
}

/**
 * Builds a standards-compatible attachment header without trusting a filename
 * supplied by the browser. The ASCII fallback supports older user agents while
 * filename* preserves Unicode names in modern browsers.
 */
export function attachmentContentDisposition(name: string): string {
  const safeName = sanitizeDownloadFilename(name)
  const asciiFallback = safeName.replace(/[^\x20-\x7e]/g, '_')
  const encodedName = encodeURIComponent(safeName).replace(/[!'()*]/g, character =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  )

  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodedName}`
}
