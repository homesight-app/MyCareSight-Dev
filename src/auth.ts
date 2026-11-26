import NextAuth, { CredentialsSignin, type DefaultSession } from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import type { JWT } from '@auth/core/jwt'
import {
  authenticateCredentials,
  readOpaqueSession,
  revokeOpaqueSession,
} from '@/lib/repositories/auth-identity'
import type { UserRole } from '@/types/auth'
import { SESSION_MAX_AGE_SECONDS } from '@/lib/auth/session-policy'
import { LOGIN_UNAVAILABLE_CODE } from '@/lib/auth/login-errors'
import { isLoginConnectionFailure } from '@/lib/auth/login-connection'
import {
  reportSessionVerificationFailure,
  SessionVerificationUnavailableError,
} from '@/lib/auth/session-diagnostics'

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
    sessionToken: string
  }
}

declare module '@auth/core/jwt' {
  interface JWT {
    role?: UserRole
    agencyId?: string | null
    fullName?: string | null
    sessionToken?: string
  }
}

function requestIp(request: Request): string | null {
  const forwarded = request.headers.get('x-forwarded-for')
  return forwarded?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || null
}

class LoginUnavailableError extends CredentialsSignin {
  code = LOGIN_UNAVAILABLE_CODE
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  // Credentials requires Auth.js's jwt strategy. These hooks replace its JWT
  // payload with a random opaque token backed by PostgreSQL.
  session: { strategy: 'jwt', maxAge: SESSION_MAX_AGE_SECONDS },
  jwt: {
    maxAge: SESSION_MAX_AGE_SECONDS,
    async encode({ token }) {
      if (!token?.sessionToken) throw new Error('Opaque session token is missing')
      return token.sessionToken
    },
    async decode({ token }): Promise<JWT | null> {
      if (!token) return null
      let identity: Awaited<ReturnType<typeof readOpaqueSession>>
      try {
        identity = await readOpaqueSession(token)
      } catch {
        reportSessionVerificationFailure('opaque-session')
        throw new SessionVerificationUnavailableError()
      }
      if (!identity) return null
      return {
        sub: identity.userId,
        email: identity.email,
        name: identity.fullName,
        role: identity.role,
        agencyId: identity.agencyId,
        fullName: identity.fullName,
        sessionToken: identity.sessionToken,
        exp: Math.floor(identity.expiresAt.getTime() / 1000),
      }
    },
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials, request) {
        if (typeof credentials?.email !== 'string' || typeof credentials?.password !== 'string') {
          return null
        }
        if (credentials.password.length < 1 || credentials.password.length > 256) return null
        let profile: Awaited<ReturnType<typeof authenticateCredentials>>
        try {
          profile = await authenticateCredentials({
            email: credentials.email,
            password: credentials.password,
            ipAddress: requestIp(request),
            userAgent: request.headers.get('user-agent'),
          })
        } catch (error) {
          console.error('[auth] Login unavailable', { stage: 'credentials', reason: isLoginConnectionFailure(error) ? 'connection' : 'verification' })
          // Auth.js serializes this fixed code; never attach the original error/cause.
          throw new LoginUnavailableError()
        }
        if (!profile) return null
        return {
          id: profile.userId,
          email: profile.email,
          role: profile.role,
          agencyId: profile.agencyId,
          fullName: profile.fullName,
          sessionToken: profile.sessionToken,
        }
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.sub = user.id
        token.email = user.email
        token.role = user.role
        token.agencyId = user.agencyId
        token.fullName = user.fullName
        token.sessionToken = user.sessionToken
      }
      return token
    },
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub
      if (token.email) session.user.email = token.email
      if (token.role) session.user.role = token.role
      session.user.agencyId = token.agencyId ?? null
      session.user.fullName = token.fullName ?? null
      return { ...session, expires: token.exp ? new Date(token.exp * 1000).toISOString() : session.expires }
    },
  },
  events: {
    async signOut(message) {
      if ('token' in message && message.token?.sessionToken) {
        await revokeOpaqueSession(message.token.sessionToken)
      }
    },
  },
  pages: {
    signIn: '/pages/auth/login',
    error: '/pages/auth/login',
  },
})
