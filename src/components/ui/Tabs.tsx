'use client'

export interface TabItem {
  key: string
  label: string
  /** Optional count shown alongside the label */
  count?: number
}

export interface TabsProps {
  items: TabItem[]
  active: string
  onChange: (key: string) => void
  /** underline — border-bottom indicator, for detail page tabs
   *  pill — rounded container, for status toggles and compact filters */
  variant?: 'underline' | 'pill'
  className?: string
}

export default function Tabs({ items, active, onChange, variant = 'underline', className = '' }: TabsProps) {
  if (variant === 'pill') {
    return (
      <div className={`inline-flex bg-gray-100 rounded-xl p-1 gap-1 ${className}`} role="tablist">
        {items.map((item) => {
          const isActive = active === item.key
          return (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onChange(item.key)}
              className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors duration-150
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1
                ${isActive ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              {item.label}
              {item.count != null && (
                <span className={`ml-1.5 text-[11px] font-semibold tabular-nums ${isActive ? 'text-gray-500' : 'text-gray-400'}`}>
                  {item.count}
                </span>
              )}
            </button>
          )
        })}
      </div>
    )
  }

  // underline variant
  return (
    <div className={`border-b border-gray-200 ${className}`}>
      <nav className="flex -mb-px gap-6 overflow-x-auto" role="tablist">
        {items.map((item) => {
          const isActive = active === item.key
          return (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onChange(item.key)}
              className={`pb-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors duration-150
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1
                ${isActive
                  ? 'border-brand text-brand'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
            >
              {item.label}
              {item.count != null && (
                <span className={`ml-2 py-0.5 px-2 rounded-full text-xs tabular-nums ${
                  isActive ? 'bg-brand-subtle text-brand' : 'bg-gray-100 text-gray-500'
                }`}>
                  {item.count}
                </span>
              )}
            </button>
          )
        })}
      </nav>
    </div>
  )
}
