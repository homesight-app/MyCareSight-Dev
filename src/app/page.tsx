import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import Link from 'next/link'
import { 
  Shield, 
  FileText, 
  Users, 
  CheckCircle2, 
  ArrowRight, 
  Sparkles,
  BarChart3,
  Clock,
  Lock as LockIcon
} from 'lucide-react'

type HomePageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

export default async function Home({ searchParams }: HomePageProps) {
  const params = (await searchParams) ?? {}
  const code = typeof params.code === 'string' ? params.code : undefined
  const type = typeof params.type === 'string' ? params.type : undefined
  const accessToken = typeof params.access_token === 'string' ? params.access_token : undefined
  const refreshToken = typeof params.refresh_token === 'string' ? params.refresh_token : undefined

  // Some invitation emails can land on "/?code=..." instead of "/auth/callback".
  // Forward auth params to the callback route so session exchange still works.
  if (code || accessToken || refreshToken) {
    const callbackParams = new URLSearchParams()
    if (code) callbackParams.set('code', code)
    if (type) callbackParams.set('type', type)
    if (accessToken) callbackParams.set('access_token', accessToken)
    if (refreshToken) callbackParams.set('refresh_token', refreshToken)
    redirect(`/auth/callback?${callbackParams.toString()}`)
  }

  const session = await getSession()

  if (session) {
    redirect('/pages/agency')
  }

  return (
    <div 
      className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 relative"
      style={{
        backgroundImage: 'url(https://images.unsplash.com/photo-1551434678-e076c223a692?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2070&q=80)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundAttachment: 'fixed',
      }}
    >
      {/* Overlay for better text readability */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-900/60 via-blue-900/50 to-indigo-900/60"></div>
      
      {/* Content wrapper with relative positioning */}
      <div className="relative z-10">
      {/* Navigation */}
      <nav className="container mx-auto px-4 py-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="inline-flex items-center justify-center w-12 h-12 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-xl shadow-lg">
              <Shield className="w-6 h-6 text-white" />
            </div>
            <span className="text-xl font-bold text-white">Home Care Licensing</span>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/pages/auth/login"
              className="px-4 py-2 text-white font-medium hover:text-gray-200 transition-colors"
            >
              Login
            </Link>
            {/* <Link
              href="/pages/auth/signup"
              className="px-6 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold rounded-xl hover:from-blue-700 hover:to-indigo-700 transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
            >
              Get Started
            </Link> */}
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="container mx-auto px-4 py-20">
        <div className="text-center max-w-4xl mx-auto">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/80 backdrop-blur-sm rounded-full shadow-md mb-6">
            <Sparkles className="w-4 h-4 text-blue-600" />
            <span className="text-sm font-semibold text-gray-700">Streamline Your Licensing Process</span>
          </div>
          <h1 className="text-5xl md:text-6xl font-bold text-white mb-6 leading-tight drop-shadow-lg">
            Your Complete
            <span className="block bg-gradient-to-r from-blue-300 to-indigo-300 bg-clip-text text-transparent">
              Licensing Management Platform
            </span>
          </h1>
          <p className="text-xl text-gray-100 mb-10 max-w-2xl mx-auto leading-relaxed drop-shadow-md">
            Simplify compliance, track licenses, and manage your home care business with confidence. 
            Everything you need in one powerful platform.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Link
              href="/pages/auth/login"
              className="group px-8 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold rounded-xl hover:from-blue-700 hover:to-indigo-700 transition-all shadow-xl hover:shadow-2xl transform hover:-translate-y-1 flex items-center gap-2"
            >
              Start Free Trial
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </Link>
            {/* <Link
              href="/pages/auth/login"
              className="px-8 py-4 bg-white text-gray-900 font-semibold rounded-xl hover:bg-gray-50 transition-all shadow-lg border border-gray-200"
            >
              Sign In
            </Link> */}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="container mx-auto px-4 py-20">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold text-white mb-4 drop-shadow-lg">
            Everything You Need to Succeed
          </h2>
          <p className="text-xl text-gray-100 max-w-2xl mx-auto drop-shadow-md">
            Powerful features designed to streamline your licensing workflow
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {/* Feature 1 */}
          <div className="bg-white rounded-2xl p-8 shadow-lg hover:shadow-2xl transition-all transform hover:-translate-y-2 border border-gray-100">
            <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center mb-6">
              <FileText className="w-7 h-7 text-white" />
            </div>
            <h3 className="text-2xl font-bold text-gray-900 mb-3">License Management</h3>
            <p className="text-gray-600 leading-relaxed">
              Track and manage all your licenses in one central location. Never miss a renewal date again.
            </p>
          </div>

          {/* Feature 2 */}
          <div className="bg-white rounded-2xl p-8 shadow-lg hover:shadow-2xl transition-all transform hover:-translate-y-2 border border-gray-100">
            <div className="w-14 h-14 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-xl flex items-center justify-center mb-6">
              <Users className="w-7 h-7 text-white" />
            </div>
            <h3 className="text-2xl font-bold text-gray-900 mb-3">Multi-Role Access</h3>
            <p className="text-gray-600 leading-relaxed">
              Secure access for company owners, staff members, admins, and experts with role-based permissions.
            </p>
          </div>

          {/* Feature 3 */}
          <div className="bg-white rounded-2xl p-8 shadow-lg hover:shadow-2xl transition-all transform hover:-translate-y-2 border border-gray-100">
            <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center mb-6">
              <BarChart3 className="w-7 h-7 text-white" />
            </div>
            <h3 className="text-2xl font-bold text-gray-900 mb-3">Compliance Tracking</h3>
            <p className="text-gray-600 leading-relaxed">
              Stay compliant with automated reminders and comprehensive tracking of all regulatory requirements.
            </p>
          </div>

          {/* Feature 4 */}
          <div className="bg-white rounded-2xl p-8 shadow-lg hover:shadow-2xl transition-all transform hover:-translate-y-2 border border-gray-100">
            <div className="w-14 h-14 bg-gradient-to-br from-green-500 to-green-600 rounded-xl flex items-center justify-center mb-6">
              <Clock className="w-7 h-7 text-white" />
            </div>
            <h3 className="text-2xl font-bold text-gray-900 mb-3">Real-Time Updates</h3>
            <p className="text-gray-600 leading-relaxed">
              Get instant notifications about license status changes, renewals, and important deadlines.
            </p>
          </div>

          {/* Feature 5 */}
          <div className="bg-white rounded-2xl p-8 shadow-lg hover:shadow-2xl transition-all transform hover:-translate-y-2 border border-gray-100">
            <div className="w-14 h-14 bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl flex items-center justify-center mb-6">
              <LockIcon className="w-7 h-7 text-white" />
            </div>
            <h3 className="text-2xl font-bold text-gray-900 mb-3">Secure & Private</h3>
            <p className="text-gray-600 leading-relaxed">
              Your data is protected with enterprise-grade security. We take privacy seriously.
            </p>
          </div>

          {/* Feature 6 */}
          <div className="bg-white rounded-2xl p-8 shadow-lg hover:shadow-2xl transition-all transform hover:-translate-y-2 border border-gray-100">
            <div className="w-14 h-14 bg-gradient-to-br from-teal-500 to-teal-600 rounded-xl flex items-center justify-center mb-6">
              <CheckCircle2 className="w-7 h-7 text-white" />
            </div>
            <h3 className="text-2xl font-bold text-gray-900 mb-3">Easy to Use</h3>
            <p className="text-gray-600 leading-relaxed">
              Intuitive interface designed for efficiency. Get up and running in minutes, not hours.
            </p>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="container mx-auto px-4 py-20">
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-3xl p-12 md:p-16 text-center shadow-2xl">
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
            Ready to Get Started?
          </h2>
          <p className="text-xl text-blue-100 mb-10 max-w-2xl mx-auto">
            Join thousands of home care businesses already using our platform to streamline their licensing process.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            {/* <Link
              href="/pages/auth/signup"
              className="group px-8 py-4 bg-white text-blue-600 font-semibold rounded-xl hover:bg-gray-50 transition-all shadow-xl hover:shadow-2xl transform hover:-translate-y-1 flex items-center gap-2"
            >
              Create Free Account
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </Link> */}
            <Link
              href="/pages/auth/login"
              className="px-8 py-4 bg-white/10 backdrop-blur-sm text-white font-semibold rounded-xl hover:bg-white/20 transition-all border border-white/20"
            >
              Sign In
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="container mx-auto px-4 py-12 border-t border-white/20">
        <div className="text-center text-gray-200">
          <p>© {new Date().getFullYear()} Home Care Licensing. All rights reserved.</p>
        </div>
      </footer>
      </div>
    </div>
  )
}
