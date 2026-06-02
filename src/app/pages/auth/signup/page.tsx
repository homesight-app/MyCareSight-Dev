'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { Mail, Lock, User as UserIcon, ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

const signupSchema = z
  .object({
    fullName: z.string().min(2, 'Full name must be at least 2 characters'),
    email: z.string().email('Please enter a valid email address'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
    confirmPassword: z.string().min(6, 'Please confirm your password'),
    role: z.enum(['company_owner', 'expert', 'admin']),
    rememberMe: z.boolean().optional(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  })

type SignupFormData = z.infer<typeof signupSchema>

// Order: Agency Admin | Expert (center) | Admin — for balanced signup UI
const ROLE_OPTIONS = [
  { value: 'company_owner', label: 'Agency Admin', description: 'Full access to manage your company' },
  { value: 'expert', label: 'Expert', description: 'Expert consultant access' },
  { value: 'admin', label: 'Admin', description: 'Administrative access to the platform' },
  // { value: 'staff_member', label: 'Caregiver', description: 'Access to assigned tasks and resources' },
]

export default function SignupPage() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'login' | 'signup'>('signup')

  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
  } = useForm<SignupFormData>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      role: 'company_owner',
      rememberMe: false,
    },
  })

  const selectedRole = watch('role')

  const onSubmit = async (data: SignupFormData) => {
    setIsLoading(true)
    setError(null)

    try {
      const supabase = createClient()
      
      // Sign up the user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
          data: {
            full_name: data.fullName,
            role: data.role,
          },
        },
      })

      if (authError) {
        setError(authError.message)
        setIsLoading(false)
        return
      }

      // User profile is automatically created by database trigger (handle_new_user)
      // The trigger uses the metadata (full_name, role) from the signup options
      // No need to manually insert as it would violate RLS policies

      // Redirect to login — credentials are never stored client-side (HIPAA)
      router.push('/pages/auth/login?message=Account+created+successfully.+Please+sign+in.')
    } catch (err) {
      setError('An unexpected error occurred. Please try again.')
      setIsLoading(false)
    }
  }

  return (
    <div 
      className="min-h-screen flex items-center justify-center p-4 py-8 sm:py-12 relative overflow-hidden"
      style={{
        backgroundImage: 'url(https://images.unsplash.com/photo-1521737604893-d14cc237f11d?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2084&q=80)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundAttachment: 'fixed',
      }}
    >
      {/* Dark overlay with gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-900/80 via-blue-900/75 to-indigo-900/80"></div>
      
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-500/20 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-indigo-500/20 rounded-full blur-3xl animate-pulse delay-1000"></div>
      </div>

      {/* Content */}
      <div className="relative z-10 w-full max-w-5xl mx-auto">
        {/* Back Button */}
        <div className="mb-6">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-white/90 hover:text-white transition-colors font-medium backdrop-blur-sm bg-white/10 px-4 py-2 rounded-lg hover:bg-white/20"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Home</span>
          </Link>
        </div>

        <div className="grid lg:grid-cols-2 gap-8 items-center">
          {/* Left Side - Branding */}
          <div className="hidden lg:block text-white space-y-6">
          
            <h1 className="text-5xl font-bold leading-tight">
              Welcome to
              <span className="block bg-gradient-to-r from-blue-300 to-indigo-300 bg-clip-text text-transparent mt-2">
                Home Care Licensing
              </span>
            </h1>
            <p className="text-xl text-gray-200 leading-relaxed">
              Your complete licensing management platform. Streamline compliance, track licenses, and manage your home care business with confidence.
            </p>
            <div className="flex flex-col gap-3 mt-8">
              <div className="flex items-center gap-3 text-gray-200">
                <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
                <span>State-specific compliance tracking</span>
              </div>
              <div className="flex items-center gap-3 text-gray-200">
                <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
                <span>Automated license renewals</span>
              </div>
              <div className="flex items-center gap-3 text-gray-200">
                <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
                <span>Multi-role access control</span>
              </div>
            </div>
          </div>

          {/* Right Side - Form Card */}
          <div className="w-full">
            <div className="bg-white/10 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20 p-8 sm:p-10">
              {/* Logo and Title for Mobile */}
              <div className="lg:hidden text-center mb-8">
               
                <h2 className="text-3xl font-bold text-white mb-2">Create Account</h2>
                <p className="text-gray-200">Join thousands of businesses</p>
              </div>

              {/* Desktop Title */}
              <div className="hidden lg:block mb-8">
                <h2 className="text-3xl font-bold text-white mb-2">Create Your Account</h2>
                <p className="text-gray-200">Get started in less than 2 minutes</p>
              </div>

              {/* Tabs */}
              <div className="flex gap-2 mb-8 bg-white/10 p-1 rounded-xl backdrop-blur-sm">
                <Link
                  href="/pages/auth/login"
                  className="flex-1 py-3 px-4 rounded-lg font-semibold transition-all text-center text-white/70 hover:text-white"
                >
                  Login
                </Link>
                <button
                  onClick={() => setActiveTab('signup')}
                  className="flex-1 py-3 px-4 rounded-lg font-semibold transition-all bg-white/20 text-white shadow-sm"
                >
                  Sign Up
                </button>
              </div>

              {/* Signup Form */}
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
                {error && (
                  <div className="bg-red-500/20 border border-red-500/50 text-red-100 px-4 py-3 rounded-xl text-sm backdrop-blur-sm">
                    {error}
                  </div>
                )}

                {/* Full Name Field */}
                <div>
                  <label htmlFor="fullName" className="block text-sm font-semibold text-white/90 mb-2">
                    Full Name
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <UserIcon className="h-5 w-5 text-white/50" />
                    </div>
                    <input
                      id="fullName"
                      type="text"
                      {...register('fullName')}
                      placeholder="John Doe"
                      className="block w-full pl-12 pr-4 py-3.5 bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl text-white placeholder-white/50 focus:ring-2 focus:ring-blue-400 focus:border-blue-400 outline-none transition-all"
                    />
                  </div>
                  {errors.fullName && (
                    <p className="mt-1 text-sm text-red-300">{errors.fullName.message}</p>
                  )}
                </div>

                {/* Email Field */}
                <div>
                  <label htmlFor="email" className="block text-sm font-semibold text-white/90 mb-2">
                    Email Address
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <Mail className="h-5 w-5 text-white/50" />
                    </div>
                    <input
                      id="email"
                      type="email"
                      {...register('email')}
                      placeholder="you@example.com"
                      className="block w-full pl-12 pr-4 py-3.5 bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl text-white placeholder-white/50 focus:ring-2 focus:ring-blue-400 focus:border-blue-400 outline-none transition-all"
                    />
                  </div>
                  {errors.email && (
                    <p className="mt-1 text-sm text-red-300">{errors.email.message}</p>
                  )}
                </div>

                {/* Password Fields */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="password" className="block text-sm font-semibold text-white/90 mb-2">
                      Password
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <Lock className="h-5 w-5 text-white/50" />
                      </div>
                      <input
                        id="password"
                        type="password"
                        {...register('password')}
                        placeholder="••••••••"
                        className="block w-full pl-12 pr-4 py-3.5 bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl text-white placeholder-white/50 focus:ring-2 focus:ring-blue-400 focus:border-blue-400 outline-none transition-all"
                      />
                    </div>
                    {errors.password && (
                      <p className="mt-1 text-sm text-red-300">{errors.password.message}</p>
                    )}
                  </div>

                  <div>
                    <label htmlFor="confirmPassword" className="block text-sm font-semibold text-white/90 mb-2">
                      Confirm Password
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <Lock className="h-5 w-5 text-white/50" />
                      </div>
                      <input
                        id="confirmPassword"
                        type="password"
                        {...register('confirmPassword')}
                        placeholder="••••••••"
                        className="block w-full pl-12 pr-4 py-3.5 bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl text-white placeholder-white/50 focus:ring-2 focus:ring-blue-400 focus:border-blue-400 outline-none transition-all"
                      />
                    </div>
                    {errors.confirmPassword && (
                      <p className="mt-1 text-sm text-red-300">{errors.confirmPassword.message}</p>
                    )}
                  </div>
                </div>

                {/* Role Selection */}
                <div>
                  <label className="block text-sm font-semibold text-white/90 mb-3">
                    I am a...
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {ROLE_OPTIONS.map((role) => (
                      <label
                        key={role.value}
                        className={`relative flex cursor-pointer rounded-xl border-2 p-4 transition-all backdrop-blur-sm ${
                          selectedRole === role.value
                            ? 'border-blue-400 bg-blue-500/30 shadow-lg'
                            : 'border-white/20 bg-white/5 hover:border-white/40 hover:bg-white/10'
                        }`}
                      >
                        <input
                          type="radio"
                          {...register('role')}
                          value={role.value}
                          className="sr-only"
                        />
                        <div className="flex-1">
                          <div className="font-semibold text-white text-sm mb-1">
                            {role.label}
                          </div>
                          <div className="text-xs text-white/70">{role.description}</div>
                        </div>
                        {selectedRole === role.value && (
                          <div className="absolute top-2 right-2">
                            <div className="w-5 h-5 bg-blue-400 rounded-full flex items-center justify-center">
                              <svg
                                className="w-3 h-3 text-white"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={3}
                                  d="M5 13l4 4L19 7"
                                />
                              </svg>
                            </div>
                          </div>
                        )}
                      </label>
                    ))}
                  </div>
                  {errors.role && (
                    <p className="mt-1 text-sm text-red-300">{errors.role.message}</p>
                  )}
                </div>

                {/* Remember Me */}
                <div className="flex items-center">
                  <label className="flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      {...register('rememberMe')}
                      className="w-4 h-4 text-blue-600 border-white/30 rounded focus:ring-blue-400 bg-white/10"
                    />
                    <span className="ml-2 text-sm text-white/90 font-medium">Remember me</span>
                  </label>
                </div>

                {/* Sign Up Button */}
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white py-4 rounded-xl font-semibold hover:from-blue-700 hover:to-indigo-700 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 focus:ring-offset-transparent transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-xl hover:shadow-2xl transform hover:-translate-y-0.5"
                >
                  {isLoading ? 'Creating account...' : 'Create Account'}
                </button>
              </form>

              <div className="mt-6 text-center text-sm text-white/80">
                Already have an account?{' '}
                <Link href="/pages/auth/login" className="font-semibold text-blue-300 hover:text-blue-200 transition-colors">
                  Sign in
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
