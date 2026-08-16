import { requireAdmin } from '@/lib/auth-helpers'
import { createClient } from '@/lib/supabase/server'
import * as q from '@/lib/supabase/query'
import PlaybookLibraryContent from '@/components/PlaybookLibraryContent'
import { getConfigurationValues } from '@/app/actions/configuration-values'

export default async function AdminPlaybooksPage() {
  await requireAdmin()
  const supabase = await createClient()

  const [{ data: playbooks }, { data: categories }] =
    await Promise.all([
      q.getAllPlaybooks(supabase),
      getConfigurationValues('PLAYBOOK_CATEGORY'),
    ])

  return (
      <PlaybookLibraryContent
        playbooks={(playbooks ?? []) as unknown as Parameters<typeof PlaybookLibraryContent>[0]['playbooks']}
        categories={(categories ?? []) as unknown as Parameters<typeof PlaybookLibraryContent>[0]['categories']}
      />
  )
}
