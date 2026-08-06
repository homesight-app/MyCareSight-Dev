'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { Mail, Lock, User, Shield, RefreshCw, GraduationCap, ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import * as q from '@/lib/supabase/query'

const loginSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  rememberMe: z.boolean().optional(),
})

type LoginFormData = z.infer<typeof loginSchema>


function LoginPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  // const [activeTab, setActiveTab] = useState<'login' | 'signup'>('login')

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      rememberMe: false,
    },
  })

  // Read messages and credentials from query parameters
  useEffect(() => {
    const message = searchParams.get('message')
    const errorParam = searchParams.get('error')
    const passwordChanged = searchParams.get('passwordChanged')
    
    // Handle password change - show success message
    if (passwordChanged === 'true') {
      setSuccessMessage('Password changed successfully! Please log in with your new password.')
      // Clear URL parameter after setting
      const url = new URL(window.location.href)
      url.searchParams.delete('passwordChanged')
      window.history.replaceState({}, '', url)
    }
    
    // For security/UX consistency, login page should always open with empty credentials.
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('signup_password')
    }
    
    if (message) {
      setSuccessMessage(message)
      // Clear URL parameters after displaying message
      const url = new URL(window.location.href)
      url.searchParams.delete('message')
      window.history.replaceState({}, '', url)
    }
    
    if (errorParam) {
      // Hide raw PKCE error when magic link was sent from server (e.g. add caregiver);
      // user can still sign in with email/password.
      const isPkceError =
        errorParam.includes('PKCE') || errorParam.toLowerCase().includes('code verifier')
      setError(isPkceError ? null : errorParam)
      // Always clear error from URL so it doesn't show on refresh
      const url = new URL(window.location.href)
      url.searchParams.delete('error')
      window.history.replaceState({}, '', url)
    }

  }, [searchParams, setValue])

  const rememberMe = watch('rememberMe')

  const onSubmit = async (data: LoginFormData) => {
    setIsLoading(true)
    setError(null)

    try {
      const supabase = createClient()
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      })
      if (authError) {
        setError(
          authError.message?.toLowerCase().includes('invalid login credentials')
            ? 'Invalid email or password. Please try again.'
            : authError.message
        )
        setIsLoading(false)
        return
      }

      if (authData.session) {
        // Get user profile to check role
        const { data: profile } = await q.getUserProfileRoleById(supabase, authData.user.id)
        // Redirect based on role
        if (profile?.role === 'admin') {
          router.push('/pages/admin')
        } else if (profile?.role === 'expert') {
          router.push('/pages/expert/clients')
        } else if (profile?.role === 'staff_member') {
          router.push('/pages/caregiver')
        } else if (profile?.role === 'care_coordinator') {
          router.push('/pages/agency/clients')
        } else {
          router.push('/pages/agency')
        }

      }
    } catch (err) {
      const isNetworkError =
        err instanceof TypeError &&
        (err.message === 'Failed to fetch' || (err as Error).message?.includes('fetch'))
      setError(
        isNetworkError
          ? 'Cannot reach the server. Check your internet connection, firewall, or try again later.'
          : 'An unexpected error occurred. Please try again.'
      )
      setIsLoading(false)
    }
  }

  return (
    <div 
      className="min-h-screen flex items-center justify-center p-4 py-8 sm:py-12 relative overflow-hidden"
      style={{
        backgroundImage: 'url(https://images.unsplash.com/photo-1557804506-669a67965ba0?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=1974&q=80)',
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
      <div className="relative z-10 w-full max-w-6xl mx-auto">
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
              Welcome Back
              <span className="block bg-gradient-to-r from-blue-300 to-indigo-300 bg-clip-text text-transparent mt-2">
                to Your Dashboard
              </span>
            </h1>
            <p className="text-xl text-gray-200 leading-relaxed">
              Access your complete licensing management platform. Manage compliance, track licenses, and streamline your home care business operations.
            </p>
            <div className="flex flex-col gap-3 mt-8">
              <div className="flex items-center gap-3 text-gray-200">
                <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
                <span>Secure, enterprise-grade authentication</span>
              </div>
              <div className="flex items-center gap-3 text-gray-200">
                <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
                <span>Real-time license status updates</span>
              </div>
              <div className="flex items-center gap-3 text-gray-200">
                <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
                <span>Role-based access control</span>
              </div>
            </div>
          </div>

          {/* Right Side - Form Card */}
          <div className="w-full">
            <div className="bg-white/10 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20 p-8 sm:p-10">
              {/* Logo and Title for Mobile */}
              <div className="lg:hidden text-center mb-8">
                <div className="inline-flex items-center justify-center w-32 h-20 bg-white rounded-2xl shadow-lg mb-4 p-3">
                  <div className="relative w-full h-full">
                    <Image
                      src="/cropped-HomeSights-NEWLOGO-1.png"
                      alt="Home Sights Consulting Logo"
                      fill
                      className="object-contain"
                      priority
                    />
                  </div>
                </div>
                <h2 className="text-3xl font-bold text-white mb-2">Sign In</h2>
                <p className="text-gray-200">Access your account</p>
              </div>

              {/* Desktop Title */}
              <div className="hidden lg:block mb-8">
                <h2 className="text-3xl font-bold text-white mb-2">Sign In to Your Account</h2>
                <p className="text-gray-200">Enter your credentials to continue</p>
              </div>

              {/* Tabs */}
              {/* <div className="flex gap-2 mb-8 bg-white/10 p-1 rounded-xl backdrop-blur-sm">
                <button
                  onClick={() => setActiveTab('login')}
                  className="flex-1 py-3 px-4 rounded-lg font-semibold transition-all bg-white/20 text-white shadow-sm"
                >
                  Login
                </button>
                <Link
                  href="/pages/auth/signup"
                  className="flex-1 py-3 px-4 rounded-lg font-semibold transition-all text-center text-white/70 hover:text-white"
                >
                  Sign Up
                </Link>
              </div> */}

              {/* Login Form */}
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" autoComplete="on">
                {successMessage && (
                  <div className="bg-green-500/20 border border-green-500/50 text-green-100 px-4 py-3 rounded-xl text-sm backdrop-blur-sm">
                    {successMessage}
                  </div>
                )}
                {error && (
                  <div className="bg-red-500/20 border border-red-500/50 text-red-100 px-4 py-3 rounded-xl text-sm backdrop-blur-sm">
                    {error}
                  </div>
                )}

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
                      name="email"
                      autoComplete="email"
                      placeholder="you@example.com"
                      className="block w-full pl-12 pr-4 py-3.5 bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl text-white placeholder-white/50 focus:ring-2 focus:ring-blue-400 focus:border-blue-400 outline-none transition-all"
                      suppressHydrationWarning
                    />
                  </div>
                  {errors.email && (
                    <p className="mt-1 text-sm text-red-300">{errors.email.message}</p>
                  )}
                </div>

                {/* Password Field */}
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
                      name="password"
                      autoComplete="current-password"
                      placeholder="••••••••"
                      className="block w-full pl-12 pr-4 py-3.5 bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl text-white placeholder-white/50 focus:ring-2 focus:ring-blue-400 focus:border-blue-400 outline-none transition-all"
                      suppressHydrationWarning
                    />
                  </div>
                  {errors.password && (
                    <p className="mt-1 text-sm text-red-300">{errors.password.message}</p>
                  )}
                </div>

                {/* Remember Me & Forgot Password */}
                <div className="flex items-center justify-between">
                  <label className="flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      {...register('rememberMe')}
                      className="w-4 h-4 text-blue-600 border-white/30 rounded focus:ring-blue-400 bg-white/10"
                    />
                    <span className="ml-2 text-sm text-white/90 font-medium">Remember me</span>
                  </label>
                  <Link
                    href="/pages/auth/reset-password"
                    className="text-sm font-semibold text-blue-300 hover:text-blue-200 transition-colors"
                  >
                    Forgot password?
                  </Link>
                </div>

                {/* Sign In Button */}
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white py-4 rounded-xl font-semibold hover:from-blue-700 hover:to-indigo-700 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 focus:ring-offset-transparent transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-xl hover:shadow-2xl transform hover:-translate-y-0.5"
                >
                  {isLoading ? 'Signing in...' : 'Sign In'}
                </button>
              </form>

              {/* Quick Access */}
              {/* <div className="mt-8">
                <div className="relative mb-6">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-white/20"></div>
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="px-4 bg-transparent text-white/70 font-medium backdrop-blur-sm">Quick Access</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {DEMO_CREDENTIALS.map((demo) => {
                    const Icon = demo.icon
                    return (
                      <button
                        key={demo.role}
                        onClick={() => handleQuickAccess(demo.email, demo.password)}
                        disabled={isLoading}
                        className="flex flex-col items-center justify-center p-4 border-2 border-white/20 rounded-xl hover:border-blue-400 hover:bg-blue-500/20 transition-all group disabled:opacity-50 disabled:cursor-not-allowed backdrop-blur-sm bg-white/5"
                      >
                        <div className={`${demo.color} p-3 rounded-xl mb-2 group-hover:scale-110 transition-transform shadow-lg`}>
                          <Icon className="w-5 h-5 text-white" />
                        </div>
                        <span className="text-sm font-semibold text-white">{demo.role}</span>
                      </button>
                    )
                  })}
                </div>
              </div> */}

              {/* <div className="mt-6 text-center text-sm text-white/80">
                Don&apos;t have an account?{' '}
                <Link href="/pages/auth/signup" className="font-semibold text-blue-300 hover:text-blue-200 transition-colors">
                  Sign up
                </Link>
              </div> */}

            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-white">Loading...</div>
      </div>
    }>
      <LoginPageContent />
    </Suspense>
  )
}
