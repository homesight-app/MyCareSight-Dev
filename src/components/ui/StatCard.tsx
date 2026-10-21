import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'

interface StatCardProps {
  title: string
  value: string | number
  icon?: LucideIcon
  iconColor?: string
  iconBg?: string
  trend?: string
  trendUp?: boolean
  href?: string
  className?: string
}

export default function StatCard({
  title,
  value,
  icon: Icon,
  iconColor = 'text-info',
  iconBg = 'bg-info-subtle',
  trend,
  trendUp,
  href,
  className = '',
}: StatCardProps) {
  const inner = (
    <div className={`bg-surface rounded-ui-surface border border-ui-border p-ui-card ${href ? 'hover:shadow-md hover:border-ui-border-strong transition-all' : ''} ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-medium text-foreground-subtle uppercase tracking-wider">{title}</div>
          <div className="text-2xl font-bold text-foreground mt-1 leading-none">{value}</div>
          {trend != null && (
            <div className={`text-xs mt-1.5 font-medium ${trendUp ? 'text-success' : 'text-red-500'}`}>
              {trendUp ? '↑' : '↓'} {trend}
            </div>
          )}
        </div>
        {Icon && (
          <div className={`shrink-0 w-10 h-10 rounded-ui-control flex items-center justify-center ${iconBg}`}>
            <Icon className={`w-5 h-5 ${iconColor}`} strokeWidth={2} />
          </div>
        )}
      </div>
    </div>
  )

  return href ? <Link href={href}>{inner}</Link> : inner
}
