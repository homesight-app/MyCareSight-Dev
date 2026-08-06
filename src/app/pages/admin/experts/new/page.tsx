import { requireAdmin } from '@/lib/auth-helpers'
import AddExpertForm from '@/components/AddExpertForm'

export default async function NewExpertPage() {
  await requireAdmin()

  return (
      <AddExpertForm />
  )
}
