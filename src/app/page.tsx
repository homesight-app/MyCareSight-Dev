import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'

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
  if (session) redirect('/pages/agency')

  redirect('/pages/auth/login')
}
