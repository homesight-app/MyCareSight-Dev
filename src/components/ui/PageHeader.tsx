import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'

export interface PageHeaderProps {
  title: string
  subtitle?: string
  /** Right-aligned action area — pass one or more Button elements */
  actions?: React.ReactNode
  /** Back navigation link */
  back?: { href: string; label: string }
  className?: string
}

export default function PageHeader({ title, subtitle, actions, back, className = '' }: PageHeaderProps) {
  return (
    <div className={`space-y-1 ${className}`}>
      {back && (
        <Link
          href={back.href}
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors duration-150 mb-2"
        >
          <ChevronLeft className="w-4 h-4" strokeWidth={2} />
          {back.label}
        </Link>
      )}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-gray-900 leading-tight">{title}</h1>
          {subtitle && (
            <p className="mt-1 text-sm text-gray-500">{subtitle}</p>
          )}
        </div>
        {actions && (
          <div className="shrink-0 flex items-center gap-2">{actions}</div>
        )}
      </div>
    </div>
  )
}
