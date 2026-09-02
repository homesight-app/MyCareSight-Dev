import Link from 'next/link'
import type { AnchorHTMLAttributes } from 'react'

export type AppLinkVariant = 'default' | 'muted' | 'breadcrumb'

export interface AppLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string
  variant?: AppLinkVariant
  /** Open in new tab */
  external?: boolean
  className?: string
}

const VARIANT_CLASSES: Record<AppLinkVariant, string> = {
  default:    'text-brand hover:text-brand-hover underline-offset-4 hover:underline transition-colors duration-150',
  muted:      'text-gray-500 hover:text-gray-700 transition-colors duration-150',
  breadcrumb: 'text-gray-400 hover:text-gray-600 transition-colors duration-150',
}

export default function AppLink({
  href,
  variant = 'default',
  external = false,
  className = '',
  children,
  ...props
}: AppLinkProps) {
  const classes = `${VARIANT_CLASSES[variant]} ${className}`.trim()

  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={classes} {...props}>
        {children}
      </a>
    )
  }

  return (
    <Link href={href} className={classes} {...props as object}>
      {children}
    </Link>
  )
}
