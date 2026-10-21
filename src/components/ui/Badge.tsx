export type BadgeColor = 'blue' | 'green' | 'amber' | 'red' | 'gray' | 'purple' | 'teal' | 'orange'
export type BadgeSize = 'sm' | 'md'

export interface BadgeProps {
  label: string
  color?: BadgeColor
  size?: BadgeSize
  className?: string
}

const COLOR_CLASSES: Record<BadgeColor, string> = {
  blue:   'bg-info-subtle text-info-subtle-foreground border-info-border',
  green:  'bg-success-subtle text-success-subtle-foreground border-success-border',
  amber:  'bg-warning-subtle text-warning-subtle-foreground border-warning-border',
  red:    'bg-danger-subtle text-danger-subtle-foreground border-danger-border',
  gray:   'bg-gray-100 text-gray-600 border-gray-200',
  purple: 'bg-purple-50 text-purple-700 border-purple-200',
  teal:   'bg-teal-50 text-teal-700 border-teal-200',
  orange: 'bg-orange-50 text-orange-700 border-orange-200',
}

/** Generic labeled badge for record types, categories, and labels.
 *  For semantic status indicators (Active, Pending, Expired, etc.) use StatusBadge instead. */
export default function Badge({ label, color = 'gray', size = 'md', className = '' }: BadgeProps) {
  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-0.5 text-xs'
  return (
    <span className={`inline-flex items-center ${sizeClasses} rounded-ui-pill font-medium border ${COLOR_CLASSES[color]} ${className}`}>
      {label}
    </span>
  )
}
