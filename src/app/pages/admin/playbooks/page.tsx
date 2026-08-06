import { requireAdmin } from '@/lib/auth-helpers'
import { createClient } from '@/lib/supabase/server'
import * as q from '@/lib/supabase/query'
import PlaybookLibraryContent from '@/components/PlaybookLibraryContent'

export default async function AdminPlaybooksPage() {
  await requireAdmin()
  const supabase = await createClient()

  const [{ data: playbooks }, { data: licenseRequirements }] =
    await Promise.all([
      q.getAllPlaybooks(supabase),
      supabase
        .from('license_requirements')
        .select('id, state, license_type')
        .order('state')
        .order('license_type'),
    ])

  return (
      <PlaybookLibraryContent
        playbooks={(playbooks ?? []) as unknown as Parameters<typeof PlaybookLibraryContent>[0]['playbooks']}
        licenseRequirements={(licenseRequirements ?? []) as { id: string; state: string; license_type: string }[]}
      />
  )
}
