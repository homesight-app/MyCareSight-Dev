'use client'

import { useState } from 'react'
import { User, Save } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { personalInfoSchema, type PersonalInfoFormData } from '@/lib/schemas/profile'
import { useRouter } from 'next/navigation'
import { UserRole } from '@/types/auth'
import { updatePersonalProfile } from '@/app/actions/users'
import { updateUserEmailAction } from '@/app/actions/auth'


interface ProfileTabsProps {
  user: {
    id: string
    email?: string | null
  }
  profile: {
    full_name?: string | null
    role?: UserRole
    email?: string | null
    phone?: string | null
    job_title?: string | null
    department?: string | null
    work_location?: string | null
    start_date?: string | null
  } | null
}

export default function ProfileTabs({ user, profile }: ProfileTabsProps) {
  const router = useRouter()
  // For experts, only show personal tab, so default to 'personal'
  const [activeTab, setActiveTab] = useState('personal')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // Parse full name
  const fullName = profile?.full_name || ''
  const nameParts = fullName.split(' ')
  const firstName = nameParts[0] || ''
  const lastName = nameParts.slice(1).join(' ') || ''

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<PersonalInfoFormData>({
    resolver: zodResolver(personalInfoSchema),
    defaultValues: {
      firstName,
      lastName,
      email: profile?.email || user.email || '',
      phone: profile?.phone || '',
      jobTitle: profile?.job_title || '',
      department: profile?.department || '',
      workLocation: profile?.work_location || '',
      startDate: profile?.start_date ? new Date(profile.start_date).toISOString().split('T')[0] : '',
    },
  })

  const onSubmit = async (data: PersonalInfoFormData) => {
    setIsLoading(true)
    setError(null)
    setSuccess(false)

    try {
      const result = await updatePersonalProfile({
        fullName: `${data.firstName} ${data.lastName}`,
        phone: data.phone || null,
        jobTitle: data.jobTitle || null,
        department: data.department || null,
        workLocation: data.workLocation || null,
        startDate: data.startDate || null,
      })

      if (result.error) {
        setError(result.error)
        setIsLoading(false)
        return
      }

      // Update email in user_profiles if changed
      if (data.email !== user.email) {
        const { error: emailError } = await updateUserEmailAction(data.email)
        if (emailError) {
          setError(emailError)
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

  const getInitials = () => {
    const name = profile?.full_name || ''
    if (name) {
      return name
        .split(' ')
        .map(n => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    }
    if (user.email) {
      return user.email[0].toUpperCase()
    }
    return 'U'
  }

  const getRoleDisplay = () => {
    if (!profile?.role) return 'User'
    return profile.role.split('_').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ')
  }

  const tabs = [{ id: 'personal', label: 'Personal Information', icon: User }]

  return (
    <div className="bg-white rounded-xl shadow-md border border-gray-100">
      {/* Header */}
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center gap-2 mb-2">
          <User className="w-6 h-6 text-gray-600" />
          <h1 className="text-lg font-bold text-gray-900">User Profile</h1>
        </div>
        <p className="text-gray-600">Manage your account settings and preferences</p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 px-6">
        {tabs.map((tab) => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-4 font-medium transition-colors relative ${
                activeTab === tab.id
                  ? 'text-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
              {activeTab === tab.id && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
              )}
            </button>
          )
        })}
      </div>

      {profile?.role === 'company_owner' && (
        <a href="/pages/agency/configuration?section=agency" className="block px-6 py-3 text-primary underline">Manage Agency Info and branches in Configuration</a>
      )}
      {/* Tab Content */}
      <div className="p-6">
        {activeTab === 'personal' && (
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

            {/* Header with Avatar */}
            <div className="flex items-center gap-4 pb-6 border-b border-gray-200">
              <div className="w-20 h-20 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold text-lg">
                {getInitials()}
              </div>
              <div className="flex-1">
                <h2 className="text-lg font-semibold text-gray-900 mb-1">
                  {profile?.full_name || user.email || 'User'}
                </h2>
                <div className="text-gray-600">{getRoleDisplay()}</div>
              </div>
            </div>

            {/* Section Header */}
            <div className="flex items-center gap-2 mb-6">
              <User className="w-5 h-5 text-gray-600" />
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Personal Information</h3>
                <p className="text-sm text-gray-600">Manage your personal details and contact information</p>
              </div>
            </div>

            {/* Form Fields */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  First Name *
                </label>
                <input
                  {...register('firstName')}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                />
                {errors.firstName && (
                  <p className="mt-1 text-sm text-red-600">{errors.firstName.message}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Last Name *
                </label>
                <input
                  {...register('lastName')}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                />
                {errors.lastName && (
                  <p className="mt-1 text-sm text-red-600">{errors.lastName.message}</p>
                )}
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Email Address *
                </label>
                <input
                  type="email"
                  {...register('email')}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                />
                {errors.email && (
                  <p className="mt-1 text-sm text-red-600">{errors.email.message}</p>
                )}
                <p className="mt-1 text-xs text-gray-500">Primary contact email for notifications</p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Phone Number
                </label>
                <input
                  {...register('phone')}
                  placeholder="(555) 123-4567"
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Job Title
                </label>
                <input
                  {...register('jobTitle')}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Department
                </label>
                <input
                  {...register('department')}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Work Location
                </label>
                <input
                  {...register('workLocation')}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Start Date
                </label>
                <input
                  type="date"
                  {...register('startDate')}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                />
              </div>
            </div>

            {/* Profile Completion */}
            {/* <div className="pt-6 border-t border-gray-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">Profile Completion</span>
                <span className="text-sm font-semibold text-gray-900">85%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div className="bg-blue-600 h-2 rounded-full" style={{ width: '85%' }} />
              </div>
              <p className="text-xs text-gray-500 mt-2">Complete your profile to unlock all features</p>
            </div> */}

            {/* Submit Button */}
            <div className="flex justify-end pt-4">
              <button
                type="submit"
                disabled={isLoading}
                className="px-6 py-3 bg-brand text-white font-semibold rounded-xl hover:bg-brand-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <Save className="w-5 h-5" />
                {isLoading ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        )}

      </div>
    </div>
  )
}







