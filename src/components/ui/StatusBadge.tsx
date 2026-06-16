type StatusKey =
  | 'active' | 'approved' | 'success' | 'complete' | 'completed' | 'signed' | 'converted'
  | 'pending' | 'in_progress' | 'review' | 'submitted'
  | 'expiring' | 'warning' | 'expiring_soon'
  | 'expired' | 'rejected' | 'error' | 'failed' | 'overdue' | 'lost'
  | 'inactive' | 'archived' | 'draft' | 'on_hold'
  | string

const STATUS_STYLES: Record<string, string> = {
  active:       'bg-green-50 text-green-700 border-green-200',
  approved:     'bg-green-50 text-green-700 border-green-200',
  success:      'bg-green-50 text-green-700 border-green-200',
  complete:     'bg-green-50 text-green-700 border-green-200',
  completed:    'bg-green-50 text-green-700 border-green-200',
  signed:       'bg-green-50 text-green-700 border-green-200',
  converted:    'bg-green-50 text-green-700 border-green-200',

  pending:      'bg-blue-50 text-blue-700 border-blue-200',
  in_progress:  'bg-blue-50 text-blue-700 border-blue-200',
  review:       'bg-blue-50 text-blue-700 border-blue-200',
  submitted:    'bg-blue-50 text-blue-700 border-blue-200',

  expiring:     'bg-amber-50 text-amber-700 border-amber-200',
  warning:      'bg-amber-50 text-amber-700 border-amber-200',
  expiring_soon:'bg-amber-50 text-amber-700 border-amber-200',

  expired:      'bg-red-50 text-red-700 border-red-200',
  rejected:     'bg-red-50 text-red-700 border-red-200',
  error:        'bg-red-50 text-red-700 border-red-200',
  failed:       'bg-red-50 text-red-700 border-red-200',
  overdue:      'bg-red-50 text-red-700 border-red-200',
  lost:         'bg-red-50 text-red-700 border-red-200',

  inactive:     'bg-slate-100 text-slate-600 border-slate-200',
  archived:     'bg-slate-100 text-slate-600 border-slate-200',
  draft:        'bg-slate-100 text-slate-600 border-slate-200',
  on_hold:      'bg-slate-100 text-slate-600 border-slate-200',
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
  const styles = STATUS_STYLES[key] ?? 'bg-slate-100 text-slate-600 border-slate-200'
  const text = label ?? STATUS_LABELS[key] ?? status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-0.5 text-xs'

  return (
    <span className={`inline-flex items-center ${sizeClasses} rounded-full font-medium border ${styles} ${className}`}>
      {text}
    </span>
  )
}
