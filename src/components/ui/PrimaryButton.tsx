import { forwardRef } from 'react'
import type { LucideIcon } from 'lucide-react'

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost'
type ButtonSize = 'sm' | 'md' | 'lg'

interface PrimaryButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  icon?: LucideIcon
  iconPosition?: 'left' | 'right'
  iconOnly?: boolean
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:   'bg-brand hover:bg-brand-hover text-white border-transparent shadow-sm',
  secondary: 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50 shadow-sm',
  danger:    'bg-red-600 hover:bg-red-700 text-white border-transparent shadow-sm',
  ghost:     'bg-transparent border-transparent text-slate-600 hover:bg-slate-100',
}

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs gap-1.5',
  md: 'px-4 py-2 text-sm gap-2',
  lg: 'px-5 py-2.5 text-sm gap-2',
}

const PrimaryButton = forwardRef<HTMLButtonElement, PrimaryButtonProps>(
  function PrimaryButton(
    {
      variant = 'primary',
      size = 'md',
      loading = false,
      icon: Icon,
      iconPosition = 'left',
      iconOnly = false,
      children,
      disabled,
      className = '',
      ...props
    },
    ref
  ) {
    const isDisabled = disabled || loading

    return (
      <button
        ref={ref}
        {...props}
        disabled={isDisabled}
        className={`
          inline-flex items-center justify-center font-medium rounded-lg border
          transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1
          disabled:opacity-50 disabled:cursor-not-allowed
          ${VARIANT_CLASSES[variant]}
          ${SIZE_CLASSES[size]}
          ${className}
        `}
      >
        {loading ? (
          <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        ) : (
          Icon && (iconOnly || iconPosition === 'left') && <Icon className="w-4 h-4" strokeWidth={2} />
        )}
        {!iconOnly && children}
        {!loading && !iconOnly && Icon && iconPosition === 'right' && <Icon className="w-4 h-4" strokeWidth={2} />}
      </button>
    )
  }
)

export default PrimaryButton
