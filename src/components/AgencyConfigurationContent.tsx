'use client'

import { useState } from 'react'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Trash2, Settings, Clock, Calendar, DollarSign, Car } from 'lucide-react'
import { saveAgencyConfiguration, type HolidayEntry } from '@/app/actions/agency-configuration'

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
}

export default function AgencyConfigurationContent({ initialConfig }: Props) {
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

  return (
    <div className="max-w-3xl mx-auto space-y-8 py-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Settings className="w-6 h-6" />
          Agency Configuration
        </h1>
        <p className="text-gray-600 mt-1 text-sm">
          Payroll rules used to calculate Regular and Overtime hours in reports.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">

        {/* Work Week */}
        <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-blue-600" />
            Work Week
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Work week starts on
              </label>
              <select
                {...register('workWeekStart', { valueAsNumber: true })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                {DAYS.map((d, i) => (
                  <option key={i} value={i}>{d}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  {...register('allowWeekends')}
                  className="w-4 h-4 text-blue-600 rounded"
                />
                <span className="text-sm font-medium text-gray-700">Allow weekend shifts</span>
              </label>

              {allowWeekends && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Weekend pay rate multiplier
                    <span className="text-gray-400 font-normal ml-1">(leave blank for regular rate)</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="1"
                    max="10"
                    placeholder="e.g. 1.25"
                    {...register('weekendRateMultiplier', { valueAsNumber: true, setValueAs: v => v === '' ? null : Number(v) })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <p className="text-xs text-gray-500 mt-1">1.25 = 25% premium over regular rate</p>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Full-Time & Overtime */}
        <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2">
            <Clock className="w-4 h-4 text-orange-600" />
            Hours &amp; Overtime Rules
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Full-time hours per week
              </label>
              <input
                type="number"
                step="0.5"
                min="1"
                {...register('fullTimeHoursPerWeek', { valueAsNumber: true })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              {errors.fullTimeHoursPerWeek && (
                <p className="text-red-600 text-xs mt-1">{errors.fullTimeHoursPerWeek.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Overtime after (hours/week)
              </label>
              <input
                type="number"
                step="0.5"
                min="1"
                {...register('overtimeThresholdWeekly', { valueAsNumber: true })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <p className="text-xs text-gray-500 mt-1">e.g. 40 = OT kicks in after 40 hrs/week</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Overtime after (hours/day)
                <span className="text-gray-400 font-normal ml-1">(optional)</span>
              </label>
              <input
                type="number"
                step="0.5"
                min="1"
                max="24"
                placeholder="e.g. 8"
                {...register('overtimeThresholdDaily', { valueAsNumber: true, setValueAs: v => v === '' ? null : Number(v) })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <p className="text-xs text-gray-500 mt-1">Leave blank if OT is weekly only</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Overtime pay rate multiplier
              </label>
              <input
                type="number"
                step="0.01"
                min="1"
                max="10"
                {...register('overtimeRateMultiplier', { valueAsNumber: true })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <p className="text-xs text-gray-500 mt-1">1.5 = time and a half &nbsp;·&nbsp; 2.0 = double time</p>
              {errors.overtimeRateMultiplier && (
                <p className="text-red-600 text-xs mt-1">{errors.overtimeRateMultiplier.message}</p>
              )}
            </div>
          </div>
        </section>

        {/* Holidays */}
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
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  {errors.holidays?.[index]?.name && (
                    <p className="text-red-600 text-xs mt-1">{errors.holidays[index]?.name?.message}</p>
                  )}
                </div>
                <div>
                  <input
                    type="date"
                    {...register(`holidays.${index}.date`)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <input
                    type="number"
                    step="0.01"
                    min="1"
                    placeholder="Rate ×"
                    {...register(`holidays.${index}.rate_multiplier`, { valueAsNumber: true })}
                    className="w-20 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => remove(index)}
                  className="p-2 text-gray-400 hover:text-red-600 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
          {fields.length > 0 && (
            <p className="text-xs text-gray-400">Rate multiplier: 1.5 = time and a half · 2.0 = double time</p>
          )}
        </section>

        {/* Mileage Reimbursement */}
        <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2">
            <Car className="w-4 h-4 text-blue-600" />
            Mileage Reimbursement
          </h2>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              {...register('mileageReimbursementEnabled')}
              className="w-4 h-4 text-blue-600 rounded"
            />
            <span className="text-sm font-medium text-gray-700">Offer mileage reimbursement to caregivers</span>
          </label>

          {mileageEnabled && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Policy effective date
                </label>
                <input
                  type="date"
                  {...register('mileageReimbursementStartDate')}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <p className="text-xs text-gray-500 mt-1">Mileage before this date is not reimbursed</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Rate per mile ($)
                </label>
                <input
                  type="number"
                  step="0.0001"
                  min="0"
                  placeholder="e.g. 0.67"
                  {...register('mileageRatePerMile', { valueAsNumber: true, setValueAs: v => v === '' ? null : Number(v) })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <p className="text-xs text-gray-500 mt-1">IRS standard rate for 2026 is $0.70/mile</p>
              </div>
            </div>
          )}
        </section>

        {/* Save */}
        <div className="flex items-center gap-4">
          <button
            type="submit"
            disabled={isSaving}
            className="px-6 py-2.5 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? 'Saving…' : 'Save Configuration'}
          </button>
          {saveSuccess && (
            <span className="text-green-600 text-sm font-medium">Configuration saved.</span>
          )}
          {saveError && (
            <span className="text-red-600 text-sm">{saveError}</span>
          )}
        </div>
      </form>
    </div>
  )
}
