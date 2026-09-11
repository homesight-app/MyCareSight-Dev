import NextAuth, { type DefaultSession } from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { createAdminClient } from '@/lib/supabase/admin'
import type { UserRole } from '@/types/auth'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      email: string
      role: UserRole
      agencyId: string | null
      fullName: string | null
    } & DefaultSession['user']
  }
  interface User {
    role: UserRole
    agencyId: string | null
    fullName: string | null
  }
}

declare module '@auth/core/jwt' {
  interface JWT {
    role?: UserRole
    agencyId?: string | null
    fullName?: string | null
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: 'jwt', maxAge: 60 * 60 }, // 1-hour tokens; is_active is fetched fresh on every request
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null

        const supabase = createAdminClient()
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('id, email, role, agency_id, full_name, password_hash, is_active')
          .eq('email', (credentials.email as string).toLowerCase().trim())
          .single()

        if (!profile) return null
        if (profile.is_active === false) return null

        // No password hash means the user needs to reset before they can log in.
        // Return null — the login page will detect this error and prompt a reset.
        if (!profile.password_hash) return null

        const valid = await bcrypt.compare(credentials.password as string, profile.password_hash)
        if (!valid) return null

        // HIPAA § 164.312(b): record login timestamp for audit trail
        await supabase
          .from('user_profiles')
          .update({ last_login_at: new Date().toISOString() })
          .eq('id', profile.id)

        return {
          id: profile.id,
          email: profile.email ?? '',
          role: profile.role as UserRole,
          agencyId: profile.agency_id ?? null,
          fullName: profile.full_name ?? null,
        }
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.role = user.role
        token.agencyId = user.agencyId
        token.fullName = user.fullName
      }
      return token
    },
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub
      if (token.role) session.user.role = token.role
      session.user.agencyId = token.agencyId ?? null
      session.user.fullName = token.fullName ?? null
      return session
    },
  },
  pages: {
    signIn: '/pages/auth/login',
    error: '/pages/auth/login',
  },
})
