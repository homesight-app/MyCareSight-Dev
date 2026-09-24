import 'server-only'

import { z } from 'zod'
import sql, { withUserContext } from '@/db'
import { getSession } from '@/lib/auth'
import {
  notePanelReadSchema, noteCountReadSchema, noteSearchAuditSchema, internalNoteSubjectSchema,
  type NotePanelReadInput, type NoteCountReadInput, type InternalNoteSubjectType,
} from '@/lib/schemas/internal-notes'

export type NotePerson = { id: string; first_name: string; last_name: string }
export type InternalNoteReadRow = {
  id: string; agency_id: string; subject_type: InternalNoteSubjectType; subject_id: string
  content: string; created_at: string; updated_at: string; created_by: string; updated_by: string | null
  tagged_patient_id: string | null; tagged_caregiver_id: string | null
  author: { full_name: string | null } | null; updater: { full_name: string | null } | null
  tagged_patient: NotePerson | null; tagged_caregiver: NotePerson | null
}
type Actor = { id: string; role: string }
type Scope = { agency_id: string; application_id: string | null }
class AccessError extends Error {}
const platform = (actor: Actor) => actor.role === 'admin' || actor.role === 'expert'
const isApplication = (type: string) => type.startsWith('application')
const errorMessage = (err: unknown) => err instanceof AccessError ? err.message : 'Unable to load internal notes'

/** Own the transaction: no result is returned unless its identifier-only audit commits. */
async function withNoteActor<T>(run: (actor: Actor) => Promise<T>): Promise<T> {
  const session = await getSession()
  if (!session || !z.uuid().safeParse(session.user.id).success) throw new AccessError('Not authenticated')
  return withUserContext(session.user.id, '', null, async () => {
    const [actor] = await sql<Actor[]>`
      SELECT id,role FROM public.user_profiles WHERE id=${session.user.id}::uuid
      AND is_active=true AND role IN ('admin','expert','company_owner','care_coordinator')
    `
    if (!actor) throw new AccessError('Forbidden')
    // Patient-table RLS still uses role/agency context. Only current Neon role is installed.
    await sql`SELECT set_config('app.current_user_role',${actor.role},true)`
    return run(actor)
  })
}

async function setAgency(actor: Actor, agencyId: string) {
  if (!platform(actor)) {
    const [membership] = await sql`SELECT 1 FROM public.user_agency_roles
      WHERE user_id=${actor.id}::uuid AND agency_id=${agencyId}::uuid
      AND role=${actor.role} AND status='active' LIMIT 1`
    if (!membership) throw new AccessError('Forbidden')
  }
  await sql`SELECT set_config('app.current_agency_id',${agencyId},true)`
}

/** Resolve actual subjects, never shared requirement-template IDs or caller-invented links. */
function subjectScopes(type: InternalNoteSubjectType, subjectId: string) {
  return sql`
    SELECT agency_id,NULL::uuid AS application_id FROM public.patients
      WHERE ${type}='patient' AND id=${subjectId}::uuid
    UNION ALL SELECT agency_id,NULL::uuid FROM public.caregiver_members
      WHERE ${type}='caregiver' AND id=${subjectId}::uuid
    UNION ALL SELECT agency_id,NULL::uuid FROM public.scheduled_visits
      WHERE ${type}='visit' AND id=${subjectId}::uuid
    UNION ALL SELECT agency_id,id FROM public.applications
      WHERE ${type}='application' AND id=${subjectId}::uuid
    UNION ALL SELECT a.agency_id,a.id FROM public.application_steps s
      JOIN public.applications a ON a.id=s.application_id
      WHERE ${type}='application_step' AND s.id=${subjectId}::uuid
    UNION ALL SELECT a.agency_id,a.id FROM public.application_documents s
      JOIN public.applications a ON a.id=s.application_id
      WHERE ${type}='application_document' AND s.id=${subjectId}::uuid
    UNION ALL SELECT a.agency_id,a.id FROM public.application_playbook_items s
      JOIN public.applications a ON a.id=s.application_id
      WHERE ${type}='application_playbook_item' AND s.id=${subjectId}::uuid
  `
}

async function requireSubject(actor: Actor, input: NotePanelReadInput) {
  if (isApplication(input.subjectType) !== platform(actor)) throw new AccessError('Forbidden')
  await setAgency(actor,input.agencyId)
  const scopes = await sql<Scope[]>`SELECT * FROM (${subjectScopes(input.subjectType,input.subjectId)}) s
    WHERE agency_id=${input.agencyId}::uuid
      AND (${input.applicationId ?? null}::uuid IS NULL OR application_id=${input.applicationId ?? null}::uuid)`
  if (scopes.length !== 1) throw new AccessError('Subject not found or not authorized')
}

function noteRows(filter: ReturnType<typeof sql>) {
  return sql<InternalNoteReadRow[]>`
    SELECT n.id,n.agency_id,n.subject_type,n.subject_id,n.content,
      n.created_at::text,n.updated_at::text,n.created_by,n.updated_by,
      n.tagged_patient_id,n.tagged_caregiver_id,
      CASE WHEN author.id IS NOT NULL THEN json_build_object('full_name',author.full_name) END AS author,
      CASE WHEN updater.id IS NOT NULL THEN json_build_object('full_name',updater.full_name) END AS updater,
      CASE WHEN p.id IS NOT NULL THEN json_build_object('id',p.id,'first_name',p.first_name,'last_name',p.last_name) END AS tagged_patient,
      CASE WHEN c.id IS NOT NULL THEN json_build_object('id',c.id,'first_name',c.first_name,'last_name',c.last_name) END AS tagged_caregiver
    FROM public.internal_notes n
    LEFT JOIN public.user_profiles author ON author.id=n.created_by
    LEFT JOIN public.user_profiles updater ON updater.id=n.updated_by
    LEFT JOIN public.patients p ON p.id=n.tagged_patient_id AND p.agency_id=n.agency_id
    LEFT JOIN public.caregiver_members c ON c.id=n.tagged_caregiver_id AND c.agency_id=n.agency_id
    WHERE ${filter}
    ORDER BY n.created_at DESC,n.id DESC LIMIT 501
  `
}

async function audit(actor: Actor, table: string, ids: string[], operation: string, agencyId: string | null = null, extra: Record<string, unknown> = {}, action = 'READ') {
  await sql`INSERT INTO public.audit_log(agency_id,table_name,record_id,action,performed_by_user_id,details)
    VALUES (${agencyId}::uuid,${table},NULL,${action},${actor.id}::uuid,
      ${JSON.stringify({operation,resource_ids:ids,...extra})}::jsonb)`
}

export async function readInternalNotesPanel(input: NotePanelReadInput) {
  const empty = { notes: [] as InternalNoteReadRow[], associatedNotes: [] as InternalNoteReadRow[], patients: [] as NotePerson[], caregivers: [] as NotePerson[] }
  try {
    const parsed=notePanelReadSchema.safeParse(input)
    if (!parsed.success) throw new AccessError('Invalid note request')
    const data=await withNoteActor(async actor => {
      const scope=parsed.data
      await requireSubject(actor,scope)
      const notes=await noteRows(sql`n.agency_id=${scope.agencyId}::uuid AND n.subject_type=${scope.subjectType} AND n.subject_id=${scope.subjectId}::uuid`)
      const associatedNotes = isApplication(scope.subjectType) || scope.subjectType === 'visit' ? [] :
        await noteRows(sql`n.agency_id=${scope.agencyId}::uuid
          AND n.subject_type IN ('patient','caregiver','visit')
          AND NOT (n.subject_type=${scope.subjectType} AND n.subject_id=${scope.subjectId}::uuid)
          AND ((${scope.subjectType}='patient' AND n.tagged_patient_id=${scope.subjectId}::uuid)
            OR (${scope.subjectType}='caregiver' AND n.tagged_caregiver_id=${scope.subjectId}::uuid))`)
      if (notes.length>500 || associatedNotes.length>500) throw new AccessError('This note list is too large to load')
      const patients = platform(actor) ? [] : await sql<NotePerson[]>`SELECT id,first_name,last_name FROM public.patients
        WHERE agency_id=${scope.agencyId}::uuid ORDER BY last_name,id`
      const caregivers = platform(actor) ? [] : await sql<NotePerson[]>`SELECT id,first_name,last_name FROM public.caregiver_members
        WHERE agency_id=${scope.agencyId}::uuid ORDER BY last_name,id`
      await audit(actor,'internal_notes',[...notes,...associatedNotes].map(n=>n.id),'read_note_panel',scope.agencyId,
        {subject_type:scope.subjectType,subject_id:scope.subjectId})
      if (!platform(actor)) {
        await audit(actor,'patients',patients.map(p=>p.id),'read_note_tag_options',scope.agencyId)
        await audit(actor,'caregiver_members',caregivers.map(c=>c.id),'read_note_tag_options',scope.agencyId)
      }
      return {notes:[...notes],associatedNotes:[...associatedNotes],patients:[...patients],caregivers:[...caregivers]}
    })
    return {...data,error:null}
  } catch(err) { return {...empty,error:errorMessage(err)} }
}

/** Platform-only counts: application notes and their existence are not agency-visible. */
export async function readApplicationNoteCounts(input: NoteCountReadInput): Promise<{ data: Record<string,number> | null; error: string | null }> {
  try {
    const parsed=noteCountReadSchema.safeParse(input)
    if (!parsed.success) throw new AccessError('Invalid note request')
    const data=await withNoteActor(async actor => {
      if (!platform(actor)) throw new AccessError('Forbidden')
      const {subjectIds,subjectType,applicationId}=parsed.data
      if (applicationId) {
        const [application]=await sql`SELECT id FROM public.applications WHERE id=${applicationId}::uuid AND agency_id IS NOT NULL`
        if (!application) throw new AccessError('Subject not found or not authorized')
      }
      const rows=await sql<{subject_id:string; count:number}[]>`
        SELECT n.subject_id,count(*)::integer AS count FROM public.internal_notes n
        WHERE n.subject_id=ANY(${subjectIds}::uuid[])
        AND n.subject_type IN ('application','application_step','application_document','application_playbook_item')
        AND (${subjectType ?? null}::text IS NULL OR n.subject_type=${subjectType ?? null})
        AND (${applicationId ?? null}::uuid IS NULL OR
          (n.subject_type='application' AND n.subject_id=${applicationId ?? null}::uuid)
          OR (n.subject_type='application_step' AND EXISTS (SELECT 1 FROM public.application_steps s WHERE s.id=n.subject_id AND s.application_id=${applicationId ?? null}::uuid))
          OR (n.subject_type='application_document' AND EXISTS (SELECT 1 FROM public.application_documents s WHERE s.id=n.subject_id AND s.application_id=${applicationId ?? null}::uuid))
          OR (n.subject_type='application_playbook_item' AND EXISTS (SELECT 1 FROM public.application_playbook_items s WHERE s.id=n.subject_id AND s.application_id=${applicationId ?? null}::uuid)))
        GROUP BY n.subject_id
      `
      await audit(actor,'internal_notes',subjectIds,'count_application_notes',null,{subject_type:subjectType ?? null})
      const counts: Record<string,number> = Object.fromEntries(subjectIds.map(id=>[id,0]))
      for (const row of rows) counts[row.subject_id]=Number(row.count)
      return counts
    })
    return {data,error:null}
  } catch(err) { return {data:null,error:errorMessage(err)} }
}

export async function auditInternalNoteSearch(input: unknown): Promise<{success:boolean;error?:string}> {
  try {
    const parsed=noteSearchAuditSchema.safeParse(input)
    if (!parsed.success) throw new AccessError('Invalid note search')
    if (parsed.data.searchTerm.trim().length<3) return {success:true}
    await withNoteActor(async actor => {
      const {searchTerm,resultsReturned,...scope}=parsed.data
      await requireSubject(actor,scope)
      await audit(actor,'internal_notes',[],'search_notes',scope.agencyId,{
        subject_type:scope.subjectType,subject_id:scope.subjectId,
        search_length:searchTerm.trim().length,results_returned:resultsReturned,
      },'SEARCH')
    })
    return {success:true}
  } catch(err) { return {success:false,error:errorMessage(err)} }
}

/** Compatibility for server-only legacy readers; callers never choose actor or role. */
export async function readLegacyInternalNotes(kind:'subject'|'patient'|'caregiver'|'id', id:string, subjectType?:InternalNoteSubjectType) {
  try {
    if (!z.uuid().safeParse(id).success || (kind==='subject' && !internalNoteSubjectSchema.safeParse(subjectType).success)) throw new AccessError('Invalid note request')
    const data=await withNoteActor(async actor => {
      // Agency context is needed by patients RLS. Iterate only server-loaded active memberships.
      const agencies=platform(actor) ? [{agency_id:null}] : await sql<{agency_id:string}[]>`
        SELECT DISTINCT agency_id FROM public.user_agency_roles
        WHERE user_id=${actor.id}::uuid AND role=${actor.role} AND status='active'
      `
      const result: InternalNoteReadRow[]=[]
      for (const scope of agencies) {
        if (scope.agency_id) await setAgency(actor,scope.agency_id)
        const rows=await noteRows(sql`
          (${scope.agency_id}::uuid IS NULL OR n.agency_id=${scope.agency_id}::uuid) AND (
            (${kind}='id' AND n.id=${id}::uuid)
            OR (${kind}='subject' AND n.subject_type=${subjectType ?? null} AND n.subject_id=${id}::uuid)
            OR (${kind}='patient' AND n.tagged_patient_id=${id}::uuid)
            OR (${kind}='caregiver' AND n.tagged_caregiver_id=${id}::uuid))`)
        result.push(...rows)
        if (result.length>500) throw new AccessError('This note list is too large to load')
      }
      result.sort((a,b)=>b.created_at.localeCompare(a.created_at)||b.id.localeCompare(a.id))
      await audit(actor,'internal_notes',result.map(row=>row.id),'read_legacy_notes')
      return result
    })
    return {data,error:null}
  } catch(err) {return {data:null,error:new Error(errorMessage(err))}}
}
