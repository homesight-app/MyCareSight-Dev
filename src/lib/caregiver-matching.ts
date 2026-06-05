import zipcodes from 'zipcodes'

export type CaregiverAvailabilityStatus = 'available' | 'booked' | 'blocked'

export type CaregiverMatchOption = {
  id: string
  name: string
  title: string
  phone: string
  availability: CaregiverAvailabilityStatus
  distanceMiles: number
  distanceLabel: string
  skillMatchPercent: number
  proximityPercent: number
  overallPercent: number
  matchedSkills: string[]
  isCurrent: boolean
}

export type StaffInput = {
  id: string
  first_name?: string | null
  last_name?: string | null
  zip_code?: string | null
  skills?: string[] | null
  job_title?: string | null
  role?: string | null
  phone?: string | null
}

export type SlotInput = {
  caregiver_member_id: string
  is_recurring: boolean
  /** HH:MM — caller is responsible for converting from UTC to local if needed */
  start_time: string
  /** HH:MM — caller is responsible for converting from UTC to local if needed */
  end_time: string
  days_of_week?: number[] | null
  repeat_start?: string | null
  repeat_end?: string | null
  specific_date?: string | null
}

export type ConflictInput = {
  id: string
  caregiver_id?: string | null
  start_time?: string | null
  end_time?: string | null
}

export type ComputeParams = {
  staff: StaffInput[]
  slots: SlotInput[]
  conflicts: ConflictInput[]
  requiredSkills: string[]
  clientZip?: string | null
  visitDate?: string | null
  visitStart?: string | null
  visitEnd?: string | null
  currentCaregiverId?: string | null
  excludeConflictId?: string | null
}

export function normalizeZip(zip: unknown): string | null {
  if (zip == null) return null
  const digits = String(zip).trim().replace(/\D/g, '').slice(0, 5)
  return digits.length === 5 ? digits : null
}

export function formatDistanceMiles(miles: number): string {
  if (!Number.isFinite(miles)) return '—'
  return `${miles.toFixed(2)} mi`
}

function parseMinutes(t: string | null | undefined): number | null {
  if (!t) return null
  const parts = String(t).trim().slice(0, 5).split(':')
  const h = Number(parts[0])
  const m = Number(parts[1])
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null
  return h * 60 + m
}

/** Proximity score on a 40-mile linear scale: 100% at 0 mi, 0% at 40+ mi. Never returns null. */
function proximityPercent(distanceMiles: number): number {
  if (!Number.isFinite(distanceMiles) || distanceMiles >= 40) return 0
  if (distanceMiles <= 0) return 100
  return Math.max(0, Math.round(100 * (1 - distanceMiles / 40)))
}

function slotCoversVisit(
  slot: SlotInput,
  visitDate: string,
  visitStartMins: number,
  visitEndMins: number,
  visitDayOfWeek: number
): boolean {
  const slotStart = parseMinutes(slot.start_time)
  const slotEnd = parseMinutes(slot.end_time)
  if (slotStart === null || slotEnd === null) return false
  if (!(slotStart <= visitStartMins && slotEnd >= visitEndMins)) return false

  if (slot.is_recurring) {
    const days = Array.isArray(slot.days_of_week) ? slot.days_of_week : []
    if (!days.includes(visitDayOfWeek)) return false
    if (slot.repeat_start && visitDate < slot.repeat_start) return false
    if (slot.repeat_end && visitDate > slot.repeat_end) return false
    return true
  }
  return slot.specific_date === visitDate
}

const availabilityRank = (s: CaregiverAvailabilityStatus) =>
  s === 'available' ? 0 : s === 'booked' ? 1 : 2

export function computeCaregiverMatches(params: ComputeParams): CaregiverMatchOption[] {
  const {
    staff,
    slots,
    conflicts,
    requiredSkills,
    clientZip: rawClientZip,
    visitDate,
    visitStart,
    visitEnd,
    currentCaregiverId,
    excludeConflictId,
  } = params

  const clientZip = normalizeZip(rawClientZip)
  const startMins = parseMinutes(visitStart)
  const endMins = parseMinutes(visitEnd)
  const hasTime = startMins !== null && endMins !== null && endMins > startMins
  const visitDayOfWeek =
    visitDate && /^\d{4}-\d{2}-\d{2}$/.test(visitDate)
      ? new Date(`${visitDate}T12:00:00`).getDay()
      : null
  const hasDate = !!visitDate && visitDayOfWeek !== null

  const options: CaregiverMatchOption[] = staff.map((s) => {
    const staffZip = normalizeZip(s.zip_code)
    let distanceMiles = Number.POSITIVE_INFINITY
    if (clientZip && staffZip) {
      const d = zipcodes.distance(clientZip, staffZip)
      if (d != null && Number.isFinite(d)) distanceMiles = d
    }

    const caregiverSkills = Array.isArray(s.skills) ? s.skills : []
    const requiredLen = requiredSkills.length
    let skillMatchPct = 100
    let matchedSkills: string[] = []
    if (requiredLen > 0) {
      matchedSkills = requiredSkills.filter((sk) => caregiverSkills.includes(sk))
      skillMatchPct = Math.round((matchedSkills.length / requiredLen) * 100)
    }

    let available = false
    let booked = false
    if (hasTime && hasDate && visitDate && visitDayOfWeek !== null) {
      available = slots.some(
        (slot) =>
          slot.caregiver_member_id === s.id &&
          slotCoversVisit(slot, visitDate, startMins as number, endMins as number, visitDayOfWeek)
      )
      if (available) {
        booked = conflicts
          .filter((c) => c.id !== excludeConflictId)
          .some((c) => {
            if (!c.caregiver_id || c.caregiver_id !== s.id) return false
            const cStart = parseMinutes(c.start_time)
            const cEnd = parseMinutes(c.end_time)
            if (cStart === null || cEnd === null) return false
            return (startMins as number) < cEnd && (endMins as number) > cStart
          })
      }
    }

    const availability: CaregiverAvailabilityStatus = available
      ? booked ? 'booked' : 'available'
      : 'blocked'

    const proxPct = proximityPercent(distanceMiles)
    const overallPct = Math.round((skillMatchPct + proxPct) / 2)

    return {
      id: s.id,
      name: [s.first_name, s.last_name].filter(Boolean).join(' ') || 'Caregiver',
      title: s.job_title?.trim() || (s.role ? String(s.role).trim() : '') || 'Caregiver',
      phone: s.phone?.trim() || '',
      availability,
      distanceMiles,
      distanceLabel: formatDistanceMiles(distanceMiles),
      skillMatchPercent: skillMatchPct,
      proximityPercent: proxPct,
      overallPercent: overallPct,
      matchedSkills,
      isCurrent: currentCaregiverId === s.id,
    }
  })

  return options.sort((a, b) => {
    const byStatus = availabilityRank(a.availability) - availabilityRank(b.availability)
    if (byStatus !== 0) return byStatus
    if (a.distanceMiles !== b.distanceMiles) return a.distanceMiles - b.distanceMiles
    return b.skillMatchPercent - a.skillMatchPercent
  })
}
