'use client'

import { useState } from 'react'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Trash2, Calendar, Clock, DollarSign, Car, GitBranch } from 'lucide-react'
import { saveAgencyConfiguration, type HolidayEntry } from '@/app/actions/agency-configuration'
import AgencyLeadStageSettings from '@/components/AgencyLeadStageSettings'
import type { AgencyLeadStage } from '@/lib/constants/lead-configs'

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const schema = z.object({
  workWeekStart: z.number().int().min(0).max(6),
  allowWeekends: z.boolean(),
  weekendRateMultiplier: z.number().min(1).max(10).nullable(),
  fullTimeHoursPerWeek: z.number().min(1).max(168),
  overtimeThresholdWeekly: z.number().min(1).max(168),
  overtimeThresholdDaily: z.number().min(1).max(24).nullable(),
  overtimeRateMultiplier: z.number().min(1).max(10),
  holidays: z.array(z.object({
    name: z.string().min(1, 'Name required'),
    date: z.string().min(1, 'Date required'),
    rate_multiplier: z.number().min(1).max(10),
  })),
  mileageReimbursementEnabled: z.boolean(),
  mileageReimbursementStartDate: z.string().nullable(),
  mileageRatePerMile: z.number().min(0).max(99).nullable(),
})

type FormValues = z.infer<typeof schema>

interface AgencyConfig {
  work_week_start: number
  allow_weekends: boolean
  weekend_rate_multiplier: number | null
  full_time_hours_per_week: number
  overtime_threshold_weekly: number
  overtime_threshold_daily: number | null
  overtime_rate_multiplier: number
  holidays: HolidayEntry[]
  mileage_reimbursement_enabled: boolean
  mileage_reimbursement_start_date: string | null
  mileage_rate_per_mile: number | null
}

interface Props {
  initialConfig: AgencyConfig | null
  agencyId: string | null
  userRole: string | null
  initialStages: AgencyLeadStage[]
}

type Category = 'schedule' | 'pay_rules' | 'mileage' | 'pipeline'

const CATEGORIES: { key: Category; label: string; icon: typeof Calendar; ownerOnly?: boolean }[] = [
  { key: 'schedule',   label: 'Work Schedule',     icon: Calendar },
  { key: 'pay_rules',  label: 'Pay Rules',         icon: DollarSign },
  { key: 'mileage',    label: 'Mileage',            icon: Car },
  { key: 'pipeline',   label: 'Lead Pipeline',      icon: GitBranch, ownerOnly: true },
]

export default function AgencyConfigurationContent({ initialConfig, agencyId, userRole, initialStages }: Props) {
  const [activeCategory, setActiveCategory] = useState<Category>('schedule')
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)

  const { register, control, handleSubmit, watch, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      workWeekStart: initialConfig?.work_week_start ?? 0,
      allowWeekends: initialConfig?.allow_weekends ?? true,
      weekendRateMultiplier: initialConfig?.weekend_rate_multiplier ?? null,
      fullTimeHoursPerWeek: initialConfig?.full_time_hours_per_week ?? 40,
      overtimeThresholdWeekly: initialConfig?.overtime_threshold_weekly ?? 40,
      overtimeThresholdDaily: initialConfig?.overtime_threshold_daily ?? null,
      overtimeRateMultiplier: initialConfig?.overtime_rate_multiplier ?? 1.5,
      holidays: initialConfig?.holidays ?? [],
      mileageReimbursementEnabled: initialConfig?.mileage_reimbursement_enabled ?? false,
      mileageReimbursementStartDate: initialConfig?.mileage_reimbursement_start_date ?? null,
      mileageRatePerMile: initialConfig?.mileage_rate_per_mile ?? null,
    },
  })

  const { fields, append, remove } = useFieldArray({ control, name: 'holidays' })
  const allowWeekends = watch('allowWeekends')
  const mileageEnabled = watch('mileageReimbursementEnabled')

  const onSubmit = async (data: FormValues) => {
    setIsSaving(true)
    setSaveError(null)
    setSaveSuccess(false)
    const result = await saveAgencyConfiguration(data)
    setIsSaving(false)
    if (result.error) {
      setSaveError(result.error)
    } else {
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)
    }
  }

  const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent'
  const labelCls = 'block text-sm font-medium text-gray-700 mb-1'

  const visibleCategories = CATEGORIES.filter(c => !c.ownerOnly || userRole === 'company_owner')

  return (
    <div className="flex gap-6 min-h-0">
      {/* Sidebar */}
      <nav className="w-48 flex-shrink-0">
        <ul className="space-y-0.5">
          {visibleCategories.map(cat => {
            const Icon = cat.icon
            const isActive = activeCategory === cat.key
            return (
              <li key={cat.key}>
                <button
                  type="button"
                  onClick={() => setActiveCategory(cat.key)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-left ${
                    isActive
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  }`}
                >
                  <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-blue-600' : 'text-gray-400'}`} />
                  {cat.label}
                </button>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* Content panel */}
      <div className="flex-1 min-w-0">
        <form onSubmit={handleSubmit(onSubmit)}>

          {/* Work Schedule */}
          {activeCategory === 'schedule' && (
            <div className="space-y-6">
              <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
                <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-blue-600" />
                  Work Week
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls}>Work week starts on</label>
                    <select
                      {...register('workWeekStart', { valueAsNumber: true })}
                      className={inputCls}
                    >
                      {DAYS.map((d, i) => (
                        <option key={i} value={i}>{d}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-3">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input type="checkbox" {...register('allowWeekends')} className="w-4 h-4 text-blue-600 rounded" />
                      <span className="text-sm font-medium text-gray-700">Allow weekend shifts</span>
                    </label>
                    {allowWeekends && (
                      <div>
                        <label className={labelCls}>
                          Weekend pay rate multiplier
                          <span className="text-gray-400 font-normal ml-1">(leave blank for regular rate)</span>
                        </label>
                        <input
                          type="number" step="0.01" min="1" max="10" placeholder="e.g. 1.25"
                          {...register('weekendRateMultiplier', { valueAsNumber: true, setValueAs: v => v === '' ? null : Number(v) })}
                          className={inputCls}
                        />
                        <p className="text-xs text-gray-500 mt-1">1.25 = 25% premium over regular rate</p>
                      </div>
                    )}
                  </div>
                </div>
              </section>

              <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
                <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-orange-600" />
                  Hours &amp; Overtime Rules
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls}>Full-time hours per week</label>
                    <input type="number" step="0.5" min="1" {...register('fullTimeHoursPerWeek', { valueAsNumber: true })} className={inputCls} />
                    {errors.fullTimeHoursPerWeek && <p className="mt-1 text-sm text-red-600">{errors.fullTimeHoursPerWeek.message}</p>}
                  </div>
                  <div>
                    <label className={labelCls}>Overtime after (hours/week)</label>
                    <input type="number" step="0.5" min="1" {...register('overtimeThresholdWeekly', { valueAsNumber: true })} className={inputCls} />
                    <p className="text-xs text-gray-500 mt-1">e.g. 40 = OT kicks in after 40 hrs/week</p>
                  </div>
                  <div>
                    <label className={labelCls}>
                      Overtime after (hours/day)
                      <span className="text-gray-400 font-normal ml-1">(optional)</span>
                    </label>
                    <input
                      type="number" step="0.5" min="1" max="24" placeholder="e.g. 8"
                      {...register('overtimeThresholdDaily', { valueAsNumber: true, setValueAs: v => v === '' ? null : Number(v) })}
                      className={inputCls}
                    />
                    <p className="text-xs text-gray-500 mt-1">Leave blank if OT is weekly only</p>
                  </div>
                  <div>
                    <label className={labelCls}>Overtime pay rate multiplier</label>
                    <input type="number" step="0.01" min="1" max="10" {...register('overtimeRateMultiplier', { valueAsNumber: true })} className={inputCls} />
                    <p className="text-xs text-gray-500 mt-1">1.5 = time and a half&nbsp;·&nbsp;2.0 = double time</p>
                    {errors.overtimeRateMultiplier && <p className="mt-1 text-sm text-red-600">{errors.overtimeRateMultiplier.message}</p>}
                  </div>
                </div>
              </section>

              <SaveRow isSaving={isSaving} saveSuccess={saveSuccess} saveError={saveError} />
            </div>
          )}

          {/* Pay Rules */}
          {activeCategory === 'pay_rules' && (
            <div className="space-y-6">
              <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-green-600" />
                    Holidays
                  </h2>
                  <button
                    type="button"
                    onClick={() => append({ name: '', date: '', rate_multiplier: 1.5 })}
                    className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 font-medium"
                  >
                    <Plus className="w-4 h-4" />
                    Add Holiday
                  </button>
                </div>
                {fields.length === 0 && (
                  <p className="text-sm text-gray-400">No holidays defined. Click &ldquo;Add Holiday&rdquo; to add one.</p>
                )}
                <div className="space-y-3">
                  {fields.map((field, index) => (
                    <div key={field.id} className="grid grid-cols-[1fr_1fr_auto_auto] gap-2 items-start">
                      <div>
                        <input
                          placeholder="Holiday name"
                          {...register(`holidays.${index}.name`)}
                          className={inputCls}
                        />
                        {errors.holidays?.[index]?.name && (
                          <p className="mt-1 text-sm text-red-600">{errors.holidays[index]?.name?.message}</p>
                        )}
                      </div>
                      <div>
                        <input type="date" {...register(`holidays.${index}.date`)} className={inputCls} />
                      </div>
                      <div>
                        <input
                          type="number" step="0.01" min="1" placeholder="Rate ×"
                          {...register(`holidays.${index}.rate_multiplier`, { valueAsNumber: true })}
                          className="w-20 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                      </div>
                      <button type="button" onClick={() => remove(index)} className="p-2 text-gray-400 hover:text-red-600 transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
                {fields.length > 0 && (
                  <p className="text-xs text-gray-400">Rate multiplier: 1.5 = time and a half · 2.0 = double time</p>
                )}
              </section>

              <SaveRow isSaving={isSaving} saveSuccess={saveSuccess} saveError={saveError} />
            </div>
          )}

          {/* Mileage */}
          {activeCategory === 'mileage' && (
            <div className="space-y-6">
              <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
                <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                  <Car className="w-4 h-4 text-blue-600" />
                  Mileage Reimbursement
                </h2>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" {...register('mileageReimbursementEnabled')} className="w-4 h-4 text-blue-600 rounded" />
                  <span className="text-sm font-medium text-gray-700">Offer mileage reimbursement to caregivers</span>
                </label>
                {mileageEnabled && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                    <div>
                      <label className={labelCls}>Policy effective date</label>
                      <input type="date" {...register('mileageReimbursementStartDate')} className={inputCls} />
                      <p className="text-xs text-gray-500 mt-1">Mileage before this date is not reimbursed</p>
                    </div>
                    <div>
                      <label className={labelCls}>Rate per mile ($)</label>
                      <input
                        type="number" step="0.0001" min="0" placeholder="e.g. 0.67"
                        {...register('mileageRatePerMile', { valueAsNumber: true, setValueAs: v => v === '' ? null : Number(v) })}
                        className={inputCls}
                      />
                      <p className="text-xs text-gray-500 mt-1">IRS standard rate for 2026 is $0.70/mile</p>
                    </div>
                  </div>
                )}
              </section>

              <SaveRow isSaving={isSaving} saveSuccess={saveSuccess} saveError={saveError} />
            </div>
          )}

        </form>

        {/* Lead Pipeline — not inside the form, uses its own actions */}
        {activeCategory === 'pipeline' && agencyId && userRole === 'company_owner' && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <div className="mb-4">
                <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                  <GitBranch className="w-4 h-4 text-blue-600" />
                  Lead Pipeline Stages
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                  Configure the stages your team uses to track patient leads. New, Closed&nbsp;–&nbsp;Won, and Closed&nbsp;–&nbsp;Lost are fixed; add custom stages in between.
                </p>
              </div>
              <AgencyLeadStageSettings agencyId={agencyId} initialStages={initialStages} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function SaveRow({ isSaving, saveSuccess, saveError }: { isSaving: boolean; saveSuccess: boolean; saveError: string | null }) {
  return (
    <div className="flex items-center gap-4">
      <button
        type="submit"
        disabled={isSaving}
        className="px-6 py-2.5 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isSaving ? 'Saving…' : 'Save'}
      </button>
      {saveSuccess && <span className="text-green-600 text-sm font-medium">Saved.</span>}
      {saveError && <span className="text-red-600 text-sm">{saveError}</span>}
    </div>
  )
}
