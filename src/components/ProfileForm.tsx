'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { profileSchema, type ProfileFormData } from '@/lib/schemas/profile'
import { User, Mail, Save, ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import * as q from '@/lib/supabase/query'
import { UserRole } from '@/types/auth'


interface ProfileFormProps {
  user: {
    id: string
    email?: string
  }
  profile?: {
    full_name?: string
    role?: UserRole
    email?: string
  } | null
}

const ROLE_OPTIONS = [
  { value: 'company_owner', label: 'Agency Admin' },
  { value: 'staff_member', label: 'Caregiver' },
  { value: 'care_coordinator', label: 'Care Coordinator' },
  { value: 'admin', label: 'Admin' },
  { value: 'expert', label: 'Expert' },
]

export default function ProfileForm({ user, profile }: ProfileFormProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      fullName: profile?.full_name || '',
      email: profile?.email || user.email || '',
      role: (profile?.role as UserRole) || 'staff_member',
    },
  })

  useEffect(() => {
    if (profile) {
      reset({
        fullName: profile.full_name || '',
        email: profile.email || user.email || '',
        role: (profile.role as UserRole) || 'staff_member',
      })
    }
  }, [profile, user.email, reset])

  const onSubmit = async (data: ProfileFormData) => {
    setIsLoading(true)
    setError(null)
    setSuccess(false)

    try {
      const supabase = createClient()

      const { error: updateError } = await q.updateUserProfile(supabase, user.id, {
        full_name: data.fullName,
        role: data.role,
        updated_at: new Date().toISOString(),
      })

      if (updateError) {
        setError(updateError.message)
        setIsLoading(false)
        return
      }

      // Update email if changed
      if (data.email !== user.email) {
        const { error: emailError } = await supabase.auth.updateUser({
          email: data.email,
        })

        if (emailError) {
          setError(emailError.message)
          setIsLoading(false)
          return
        }
      }

      setSuccess(true)
      setIsLoading(false)
      router.refresh()

      setTimeout(() => {
        setSuccess(false)
      }, 3000)
    } catch (err) {
      setError('An unexpected error occurred. Please try again.')
      setIsLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
          {error}
        </div>
      )}

      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-xl text-sm">
          Profile updated successfully!
        </div>
      )}

      {/* Full Name Field */}
      <div>
        <label htmlFor="fullName" className="block text-sm font-semibold text-gray-700 mb-2">
          Full Name
        </label>
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
            <User className="h-5 w-5 text-gray-400" />
          </div>
          <input
            id="fullName"
            type="text"
            {...register('fullName')}
            placeholder="John Doe"
            className="block w-full pl-12 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
          />
        </div>
        {errors.fullName && (
          <p className="mt-1 text-sm text-red-600">{errors.fullName.message}</p>
        )}
      </div>

      {/* Email Field */}
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
            {...register('email')}
            placeholder="you@example.com"
            className="block w-full pl-12 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
          />
        </div>
        {errors.email && (
          <p className="mt-1 text-sm text-red-600">{errors.email.message}</p>
        )}
        <p className="mt-1 text-xs text-gray-500">
          Changing your email will require verification
        </p>
      </div>

      {/* Role Field */}
      <div>
        <label htmlFor="role" className="block text-sm font-semibold text-gray-700 mb-2">
          Role
        </label>
        <select
          id="role"
          {...register('role')}
          className="block w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
        >
          {ROLE_OPTIONS.map((role) => (
            <option key={role.value} value={role.value}>
              {role.label}
            </option>
          ))}
        </select>
        {errors.role && (
          <p className="mt-1 text-sm text-red-600">{errors.role.message}</p>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex gap-4 pt-4">
        <Link
          href="/pages/agency"
          className="flex items-center gap-2 px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors font-semibold"
        >
          <ArrowLeft className="w-5 h-5" />
          Cancel
        </Link>
        <button
          type="submit"
          disabled={isLoading}
          className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl hover:from-blue-700 hover:to-indigo-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed font-semibold shadow-lg"
        >
          <Save className="w-5 h-5" />
          {isLoading ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </form>
  )
}


