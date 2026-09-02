'use client'

import { forwardRef } from 'react'
import { ChevronDown } from 'lucide-react'

export interface SelectOption {
  value: string
  label: string
}

export interface FilterSelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'onChange'> {
  options: SelectOption[]
  value: string
  onChange: (value: string) => void
  /** Empty-value placeholder option label */
  placeholder?: string
  className?: string
}

const FilterSelect = forwardRef<HTMLSelectElement, FilterSelectProps>(
  function FilterSelect({ options, value, onChange, placeholder, className = '', ...props }, ref) {
    return (
      <div className={`relative inline-block ${className}`}>
        <select
          ref={ref}
          value={value}
          onChange={e => onChange(e.target.value)}
          className="appearance-none w-full pl-3 pr-8 py-2 text-sm border border-gray-200 rounded-lg
            bg-white text-gray-700 cursor-pointer
            focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent
            transition-colors duration-150
            disabled:opacity-50 disabled:cursor-not-allowed"
          {...props}
        >
          {placeholder && <option value="">{placeholder}</option>}
          {options.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <ChevronDown
          className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
          strokeWidth={2}
        />
      </div>
    )
  }
)

export default FilterSelect
