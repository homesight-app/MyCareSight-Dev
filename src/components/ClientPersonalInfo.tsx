'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Edit } from 'lucide-react'
import Button from '@/components/ui/PrimaryButton'
import BranchSelectField from './BranchSelectField'
import { clientPersonalInfoSchema, type ClientPersonalInfoData } from '@/lib/schemas/client-personal-info'
import { saveClientPersonalInfoAction } from '@/app/actions/client-personal-info'
import { ageFromDateOfBirth } from '@/lib/age-from-date-of-birth'
import { patientFullName } from '@/lib/patient-name'
import { toast } from 'sonner'

type PersonalClient = { id: string; first_name: string; last_name: string; gender: string | null; date_of_birth: string; branch_id?: string | null; branch_name?: string | null }
export default function ClientPersonalInfo({ client, branchesEnabled = false, canEditBranch = false, onSaved, dobFromAge, formatDate }: {
  client: PersonalClient; branchesEnabled?: boolean; canEditBranch?: boolean
  onSaved: (data: Partial<PersonalClient> & { age: number | null }) => void
  dobFromAge: (age: number) => string; formatDate: (value: string) => string
}) {
  const [editing, setEditing] = useState(false)
  const [branchName, setBranchName] = useState(client.branch_name)
  const { register, reset, watch, setValue, setError, handleSubmit, formState: { errors, isSubmitting } } = useForm<ClientPersonalInfoData>({
    resolver: zodResolver(clientPersonalInfoSchema), mode: 'onBlur',
    defaultValues: { first_name: client.first_name ?? '', last_name: client.last_name ?? '', gender: client.gender ?? '', date_of_birth: client.date_of_birth ?? '' },
  })
  const start = () => {
    reset({ first_name: client.first_name ?? '', last_name: client.last_name ?? '', gender: client.gender ?? '', date_of_birth: client.date_of_birth ?? '',
      branchId: branchesEnabled && canEditBranch ? client.branch_id ?? undefined : undefined })
    setBranchName(client.branch_name); setEditing(true)
  }
  const save = handleSubmit(async data => {
    try {
      const result = await saveClientPersonalInfoAction(client.id, { ...data, branchId: branchesEnabled && canEditBranch ? data.branchId : undefined })
      if (!result.success) {
        if (result.fieldErrors) Object.entries(result.fieldErrors).forEach(([key, messages]) => setError(key as keyof ClientPersonalInfoData, { message: messages[0] }))
        else toast.error(result.error)
        return
      }
      onSaved({ first_name: data.first_name, last_name: data.last_name, gender: data.gender || null, date_of_birth: data.date_of_birth,
        age: ageFromDateOfBirth(data.date_of_birth), ...(branchesEnabled && canEditBranch ? { branch_id: data.branchId, branch_name: branchName } : {}) })
      setEditing(false)
    } catch { toast.error('Unable to save client information. Refresh before retrying.') }
  })
  const controlClass = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm'
  const fieldError = (key: keyof ClientPersonalInfoData) => errors[key] ? <p id={'personal-' + key + '-error'} role="alert" className="text-sm text-danger">{errors[key]?.message}</p> : null
  return <div className="bg-gray-50 rounded-lg p-6 border border-gray-200">
    <div className="flex items-center justify-between mb-4">
      <h3 className="text-lg font-semibold text-gray-900">Personal Information</h3>
      {editing ? <div className="flex items-center gap-2">
        <Button type="button" variant="secondary" size="sm" disabled={isSubmitting} onClick={() => setEditing(false)}>Cancel</Button>
        <Button type="submit" form="form-personal" loading={isSubmitting} size="sm">Save</Button>
      </div> : <Button variant="ghost" icon={Edit} iconOnly aria-label="Edit personal information" onClick={start} />}
    </div>
    {editing ? <form id="form-personal" noValidate onSubmit={save} className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {(['first_name', 'last_name'] as const).map(key => <div key={key}>
        <label htmlFor={'personal-' + key} className="block text-sm text-gray-600 mb-1">{key === 'first_name' ? 'First Name' : 'Last Name'}{key === 'first_name' && <span className="text-danger"> *</span>}</label>
        <input id={'personal-' + key} className={controlClass} disabled={isSubmitting} {...register(key)} aria-invalid={!!errors[key]} aria-describedby={errors[key] ? 'personal-' + key + '-error' : undefined} />
        {fieldError(key)}
      </div>)}
      <div><label htmlFor="personal-gender" className="block text-sm text-gray-600 mb-1">Gender</label>
        <select id="personal-gender" className={controlClass} disabled={isSubmitting} {...register('gender')}>
          <option value="">Select...</option>{['Male', 'Female', 'Other', 'Prefer not to say'].map(value => <option key={value}>{value}</option>)}
        </select>{fieldError('gender')}
      </div>
      <div><label htmlFor="personal-dob" className="block text-sm text-gray-600 mb-1">Date of Birth</label>
        <input id="personal-dob" type="date" className={controlClass} disabled={isSubmitting} {...register('date_of_birth')} aria-invalid={!!errors.date_of_birth} aria-describedby={errors.date_of_birth ? 'personal-date_of_birth-error' : undefined} />{fieldError('date_of_birth')}
      </div>
      <div><label htmlFor="personal-age" className="block text-sm text-gray-600 mb-1">Age</label>
        <input id="personal-age" type="number" min={0} max={150} value={ageFromDateOfBirth(watch('date_of_birth')) || ''} className={controlClass} disabled={isSubmitting}
          onChange={event => setValue('date_of_birth', dobFromAge(Math.min(150, Math.max(0, parseInt(event.target.value, 10) || 0))), { shouldDirty: true, shouldValidate: true })} />
      </div>
      {branchesEnabled && <BranchSelectField id="client-branch" value={canEditBranch ? watch('branchId') : client.branch_id ?? undefined} currentName={client.branch_name}
        disabled={isSubmitting || !canEditBranch} onChange={(value, name) => { setValue('branchId', value, { shouldDirty: true, shouldValidate: true }); setBranchName(name) }} error={errors.branchId?.message} />}
    </form> : <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {[['Full Name:', patientFullName(client)], ['Gender:', client.gender || 'N/A'], ['Date of Birth:', formatDate(client.date_of_birth)],
        ['Age:', ageFromDateOfBirth(client.date_of_birth) === null ? 'N/A' : `${ageFromDateOfBirth(client.date_of_birth)} years`],
        ...(branchesEnabled ? [['Branch:', client.branch_name || 'Not assigned']] : [])].map(([label, value]) => <div key={label}>
          <span className="text-sm text-gray-600">{label}</span><p className="text-sm font-medium text-gray-900">{value}</p>
        </div>)}
    </div>}
  </div>
}
