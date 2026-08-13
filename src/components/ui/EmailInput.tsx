'use client'

import { forwardRef } from 'react'

interface EmailInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  error?: string
}

/**
 * Drop-in replacement for <input type="email"> that shows an inline error message.
 * Works with React Hook Form register spread and with plain controlled inputs.
 *
 * RHF: <EmailInput {...register('email')} error={errors.email?.message} className="..." />
 * Plain: <EmailInput value={form.email} onChange={handleChange} error={fieldErrors.email} className="..." />
 */
const EmailInput = forwardRef<HTMLInputElement, EmailInputProps>(
  ({ error, ...props }, ref) => (
    <>
      <input
        ref={ref}
        type="email"
        placeholder="name@example.com"
        {...props}
      />
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </>
  )
)
EmailInput.displayName = 'EmailInput'
export default EmailInput
