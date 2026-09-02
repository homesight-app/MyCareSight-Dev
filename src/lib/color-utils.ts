function hexToRgb(hex: string): [number, number, number] | null {
  const clean = hex.replace('#', '')
  if (clean.length !== 6) return null
  const r = parseInt(clean.slice(0, 2), 16)
  const g = parseInt(clean.slice(2, 4), 16)
  const b = parseInt(clean.slice(4, 6), 16)
  if (isNaN(r) || isNaN(g) || isNaN(b)) return null
  return [r, g, b]
}

function clamp(v: number) { return Math.max(0, Math.min(255, v)) }

function toHex(r: number, g: number, b: number) {
  return `#${[r, g, b].map(c => clamp(c).toString(16).padStart(2, '0')).join('')}`
}

export function hexDarken(hex: string, amount = 20): string {
  const rgb = hexToRgb(hex)
  if (!rgb) return hex
  return toHex(rgb[0] - amount, rgb[1] - amount, rgb[2] - amount)
}

export function hexLighten(hex: string, amount = 40): string {
  const rgb = hexToRgb(hex)
  if (!rgb) return hex
  return toHex(rgb[0] + amount, rgb[1] + amount, rgb[2] + amount)
}

export interface BrandingColorValues {
  primaryColor?: string | null
  sidebarColor?: string | null
}

/** Returns an inline CSS string to override branding vars, or null if no overrides needed. */
export function buildBrandingStyleVars(branding: BrandingColorValues): string | null {
  const parts: string[] = []
  if (branding.primaryColor) {
    parts.push(`--brand: ${branding.primaryColor};`)
    parts.push(`--brand-hover: ${hexDarken(branding.primaryColor)};`)
    parts.push(`--brand-subtle: ${hexLighten(branding.primaryColor)};`)
  }
  if (branding.sidebarColor) {
    parts.push(`--sidebar-bg: ${branding.sidebarColor};`)
  }
  return parts.length > 0 ? parts.join(' ') : null
}
