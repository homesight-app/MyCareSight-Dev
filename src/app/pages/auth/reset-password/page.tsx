'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { Mail, Lock, FileText } from 'lucide-react'
import {
  checkEmailExistsForReset,
  sendPasswordResetAction,
  updatePasswordWithTokenAction,
} from '@/app/actions/auth'

const resetSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
})

const updatePasswordSchema = z
  .object({
    password: z.string().min(6, 'Password must be at least 6 characters'),
    confirmPassword: z.string().min(6, 'Please confirm your password'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  })

type ResetFormData = z.infer<typeof resetSchema>
type UpdatePasswordFormData = z.infer<typeof updatePasswordSchema>

function ResetPasswordPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [token, setToken] = useState<string | null>(null)

  const isUpdateMode = !!token

  const resetForm = useForm<ResetFormData>({
    resolver: zodResolver(resetSchema),
  })

  const updatePasswordForm = useForm<UpdatePasswordFormData>({
    resolver: zodResolver(updatePasswordSchema),
  })

  useEffect(() => {
    const tokenParam = searchParams.get('token')
    if (tokenParam) {
      setToken(tokenParam)
    }
  }, [searchParams])

  const onResetSubmit = async (data: ResetFormData) => {
    setIsLoading(true)
    setError(null)

    try {
      const { exists, error: checkError } = await checkEmailExistsForReset(data.email)
      if (checkError) {
        setError(checkError)
        setIsLoading(false)
        return
      }
      if (!exists) {
        setError("Email doesn't exist, please contact with admin")
        setIsLoading(false)
        return
      }

      const { error: resetError } = await sendPasswordResetAction(data.email)
      if (resetError) {
        setError(resetError)
        setIsLoading(false)
        return
      }

      setSuccess(true)
      setIsLoading(false)
    } catch {
      setError('An unexpected error occurred. Please try again.')
      setIsLoading(false)
    }
  }

  const onUpdatePasswordSubmit = async (data: UpdatePasswordFormData) => {
    setIsLoading(true)
    setError(null)

    try {
      if (!token) {
        setError('Invalid reset link. Please request a new one.')
        setIsLoading(false)
        return
      }

      const { error: updateError } = await updatePasswordWithTokenAction(token, data.password)

      if (updateError) {
        setError(updateError)
        setIsLoading(false)
        return
      }

      setSuccess(true)
      setTimeout(() => {
        router.push('/pages/auth/login?passwordChanged=true')
      }, 2000)
    } catch {
      setError('An unexpected error occurred. Please try again.')
      setIsLoading(false)
    }
  }

  if (isUpdateMode) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 flex items-center justify-center p-4 py-8 sm:py-12">
        <div className="w-full max-w-md">
          {/* Logo and Title */}
          <div className="text-center mb-6 sm:mb-8">
            <div className="inline-flex items-center justify-center w-12 h-12 sm:w-16 sm:h-16 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl shadow-lg mb-3 sm:mb-4">
              <svg
                className="w-8 h-8 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
            </div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">Reset Password</h1>
          <p className="text-sm sm:text-base text-gray-600">Enter your new password</p>
          </div>

          {/* Update Password Form */}
          <div className="bg-white rounded-2xl sm:rounded-3xl shadow-2xl p-6 sm:p-8 border border-gray-100">
            <form onSubmit={updatePasswordForm.handleSubmit(onUpdatePasswordSubmit)} className="space-y-6">
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
                  {error}
                </div>
              )}

              {success && (
                <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-xl text-sm">
                  Password updated successfully! Redirecting to login...
                </div>
              )}

              <div>
                <label htmlFor="password" className="block text-sm font-semibold text-gray-700 mb-2">
                  New Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Lock className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    id="password"
                    type="password"
                    {...updatePasswordForm.register('password')}
                    placeholder="••••••••"
                    className="block w-full pl-12 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                  />
                </div>
                {updatePasswordForm.formState.errors.password && (
                  <p className="mt-1 text-sm text-red-600">
                    {updatePasswordForm.formState.errors.password.message}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-semibold text-gray-700 mb-2">
                  Confirm New Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Lock className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    id="confirmPassword"
                    type="password"
                    {...updatePasswordForm.register('confirmPassword')}
                    placeholder="••••••••"
                    className="block w-full pl-12 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                  />
                </div>
                {updatePasswordForm.formState.errors.confirmPassword && (
                  <p className="mt-1 text-sm text-red-600">
                    {updatePasswordForm.formState.errors.confirmPassword.message}
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={isLoading || success}
                className="w-full bg-gradient-to-r from-gray-900 to-gray-800 text-white py-3.5 rounded-xl font-semibold hover:from-gray-800 hover:to-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
              >
                {isLoading ? 'Updating...' : 'Update Password'}
              </button>
            </form>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 flex items-center justify-center p-4 py-8 sm:py-12">
      <div className="w-full max-w-md">
        {/* Logo and Title */}
        <div className="text-center mb-6 sm:mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 sm:w-16 sm:h-16 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl shadow-lg mb-3 sm:mb-4">
            <svg
              className="w-8 h-8 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">Reset Password</h1>
          <p className="text-sm sm:text-base text-gray-600">Enter your email to receive a reset link</p>
        </div>

        {/* Reset Form */}
        <div className="bg-white rounded-2xl sm:rounded-3xl shadow-2xl p-6 sm:p-8 border border-gray-100">
          <form onSubmit={resetForm.handleSubmit(onResetSubmit)} className="space-y-6">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
                {error}
              </div>
            )}

            {success && (
              <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-xl text-sm">
                Password reset link has been sent to your email. Please check your inbox.
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-sm font-semibold text-gray-700 mb-2">
                Email Address
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  id="email"
                  type="email"
                  {...resetForm.register('email')}
                  placeholder="you@example.com"
                  className="block w-full pl-12 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                />
              </div>
              {resetForm.formState.errors.email && (
                <p className="mt-1 text-sm text-red-600">
                  {resetForm.formState.errors.email.message}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={isLoading || success}
              className="w-full bg-gradient-to-r from-gray-900 to-gray-800 text-white py-3.5 rounded-xl font-semibold hover:from-gray-800 hover:to-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
            >
              {isLoading ? 'Sending...' : 'Send Reset Link'}
            </button>
          </form>

          <div className="mt-6 text-center text-sm text-gray-600">
            Remember your password?{' '}
            <Link href="/pages/auth/login" className="font-semibold text-blue-600 hover:text-blue-700">
              Sign in
            </Link>
          </div>
        </div>

        {/* Feature Icons */}
        <div className="mt-6 sm:mt-8 flex justify-center gap-4 sm:gap-8 text-gray-600 flex-wrap">
          <div className="flex flex-col items-center">
            <div className="bg-white p-2 sm:p-3 rounded-xl shadow-sm mb-2">
              <FileText className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <span className="text-xs font-medium text-center">State-Specific Checklists</span>
          </div>
          <div className="flex flex-col items-center">
            <div className="bg-white p-2 sm:p-3 rounded-xl shadow-sm mb-2">
              <FileText className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <span className="text-xs font-medium text-center">Auto Document Generation</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-600">Loading...</div>
      </div>
    }>
      <ResetPasswordPageContent />
    </Suspense>
  )
}
