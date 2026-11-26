'use client'

import { SessionProvider } from 'next-auth/react'
import { SessionLifecycle } from '@/components/SessionLifecycle'

export function AuthProvider({ children }: { children: React.ReactNode }) {
  return <SessionProvider refetchOnWindowFocus={false}>
    <SessionLifecycle>{children}</SessionLifecycle>
  </SessionProvider>
}
