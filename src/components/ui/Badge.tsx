export type BadgeColor = 'blue' | 'green' | 'amber' | 'red' | 'gray' | 'purple' | 'teal' | 'orange'
export type BadgeSize = 'sm' | 'md'

export interface BadgeProps {
  label: string
  color?: BadgeColor
  size?: BadgeSize
  className?: string
}

const COLOR_CLASSES: Record<BadgeColor, string> = {
  blue:   'bg-blue-50 text-blue-700 border-blue-200',
  green:  'bg-green-50 text-green-700 border-green-200',
  amber:  'bg-amber-50 text-amber-700 border-amber-200',
  red:    'bg-red-50 text-red-700 border-red-200',
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
    <span className={`inline-flex items-center ${sizeClasses} rounded-full font-medium border ${COLOR_CLASSES[color]} ${className}`}>
      {label}
    </span>
  )
}
