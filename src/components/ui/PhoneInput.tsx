'use client'

import { forwardRef } from 'react'
import { formatUSPhone } from '@/lib/validation'

interface PhoneInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  error?: string
}

/**
 * Drop-in replacement for <input type="tel"> that auto-formats to (555) 123-4567 as the user
 * types and shows an inline error message. Works with React Hook Form register spread and
 * with plain controlled value/onChange.
 *
 * RHF: <PhoneInput {...register('phone')} error={errors.phone?.message} className="..." />
 * Plain: <PhoneInput value={form.phone} onChange={handleChange} error={fieldErrors.phone} className="..." />
 */
const PhoneInput = forwardRef<HTMLInputElement, PhoneInputProps>(
  ({ error, onChange, ...props }, ref) => (
    <>
      <input
        ref={ref}
        type="tel"
        placeholder="(555) 123-4567"
        {...props}
        onChange={e => {
          const formatted = formatUSPhone(e.target.value)
          // Update the native input value so RHF reads the formatted string via its ref
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')
            ?.set?.call(e.target, formatted)
          onChange?.({ ...e, target: e.target })
        }}
      />
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </>
  )
)
PhoneInput.displayName = 'PhoneInput'
export default PhoneInput
