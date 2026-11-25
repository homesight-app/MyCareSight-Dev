'use client'

import { forwardRef, type SelectHTMLAttributes } from 'react'
import { US_STATES } from '@/lib/constants'

interface StateSelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children' | 'multiple'> {
  currentValue?: string
}

/** Reuses the shared state catalog; accepts RHF register/ref or controlled props. */
const StateSelect = forwardRef<HTMLSelectElement, StateSelectProps>(
  ({ currentValue, ...props }, ref) => <select ref={ref} {...props}>
    <option value="">Select a state</option>
    {currentValue && !US_STATES.includes(currentValue) && <option value={currentValue}>{currentValue} (choose a state)</option>}
    {US_STATES.map(state => <option key={state} value={state}>{state}</option>)}
  </select>
)
StateSelect.displayName = 'StateSelect'
export default StateSelect
