type StatusKey =
  | 'active' | 'approved' | 'success' | 'complete' | 'completed' | 'signed' | 'converted'
  | 'pending' | 'in_progress' | 'review' | 'submitted'
  | 'expiring' | 'warning' | 'expiring_soon'
  | 'expired' | 'rejected' | 'error' | 'failed' | 'overdue' | 'lost'
  | 'inactive' | 'archived' | 'draft' | 'on_hold'
  | string

const STATUS_TONE_CLASSES = {
  success: 'bg-success-subtle text-success-subtle-foreground border-success-border',
  info: 'bg-info-subtle text-info-subtle-foreground border-info-border',
  warning: 'bg-warning-subtle text-warning-subtle-foreground border-warning-border',
  danger: 'bg-danger-subtle text-danger-subtle-foreground border-danger-border',
  neutral: 'bg-surface-subtle text-foreground-muted border-ui-border',
} as const

const STATUS_STYLES: Record<string, string> = {
  active:       STATUS_TONE_CLASSES.success,
  approved:     STATUS_TONE_CLASSES.success,
  success:      STATUS_TONE_CLASSES.success,
  complete:     STATUS_TONE_CLASSES.success,
  completed:    STATUS_TONE_CLASSES.success,
  signed:       STATUS_TONE_CLASSES.success,
  converted:    STATUS_TONE_CLASSES.success,

  pending:      STATUS_TONE_CLASSES.info,
  in_progress:  STATUS_TONE_CLASSES.info,
  review:       STATUS_TONE_CLASSES.info,
  submitted:    STATUS_TONE_CLASSES.info,

  expiring:     STATUS_TONE_CLASSES.warning,
  warning:      STATUS_TONE_CLASSES.warning,
  expiring_soon: STATUS_TONE_CLASSES.warning,

  expired:      STATUS_TONE_CLASSES.danger,
  rejected:     STATUS_TONE_CLASSES.danger,
  error:        STATUS_TONE_CLASSES.danger,
  failed:       STATUS_TONE_CLASSES.danger,
  overdue:      STATUS_TONE_CLASSES.danger,
  lost:         STATUS_TONE_CLASSES.danger,

  inactive:     STATUS_TONE_CLASSES.neutral,
  archived:     STATUS_TONE_CLASSES.neutral,
  draft:        STATUS_TONE_CLASSES.neutral,
  on_hold:      STATUS_TONE_CLASSES.neutral,
}

const STATUS_LABELS: Record<string, string> = {
  active:       'Active',
  approved:     'Approved',
  success:      'Success',
  complete:     'Complete',
  completed:    'Completed',
  signed:       'Signed',
  converted:    'Converted',
  pending:      'Pending',
  in_progress:  'In Progress',
  review:       'In Review',
  submitted:    'Submitted',
  expiring:     'Expiring',
  warning:      'Warning',
  expiring_soon:'Expiring Soon',
  expired:      'Expired',
  rejected:     'Rejected',
  error:        'Error',
  failed:       'Failed',
  overdue:      'Overdue',
  lost:         'Lost',
  inactive:     'Inactive',
  archived:     'Archived',
  draft:        'Draft',
  on_hold:      'On Hold',
}

interface StatusBadgeProps {
  status: StatusKey
  label?: string
  size?: 'sm' | 'md'
  className?: string
}

export default function StatusBadge({ status, label, size = 'md', className = '' }: StatusBadgeProps) {
  const key = status.toLowerCase().replace(/[\s-]/g, '_')
  const styles = STATUS_STYLES[key] ?? STATUS_TONE_CLASSES.neutral
  const text = label ?? STATUS_LABELS[key] ?? status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-0.5 text-xs'

  return (
    <span className={`inline-flex items-center ${sizeClasses} rounded-ui-pill font-medium border ${styles} ${className}`}>
      {text}
    </span>
  )
}
