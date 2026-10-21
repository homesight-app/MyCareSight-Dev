interface SectionCardProps {
  children: React.ReactNode
  title?: string
  description?: string
  action?: React.ReactNode
  className?: string
  noPadding?: boolean
}

export default function SectionCard({
  children,
  title,
  description,
  action,
  className = '',
  noPadding = false,
}: SectionCardProps) {
  const hasHeader = title || action

  return (
    <div className={`bg-surface rounded-ui-surface border border-ui-border shadow-ui-surface overflow-hidden ${className}`}>
      {hasHeader && (
        <div className="px-5 py-4 border-b border-surface-subtle flex items-center justify-between gap-4">
          <div className="min-w-0">
            {title && <h3 className="text-sm font-semibold text-slate-800">{title}</h3>}
            {description && <p className="text-xs text-foreground-subtle mt-0.5">{description}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      <div className={noPadding ? '' : 'p-ui-card'}>{children}</div>
    </div>
  )
}
