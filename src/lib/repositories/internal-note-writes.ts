import 'server-only'

import { z } from 'zod'
import sql, { withActorContext } from '@/db'
import { getSession } from '@/lib/auth'
import {
  noteCreateSchema, noteUpdateSchema, noteDeleteSchema,
  type NoteCreateInput, type NoteUpdateInput, type NoteDeleteInput,
  type InternalNoteSubjectType,
} from '@/lib/schemas/internal-notes'

type Actor = { id: string; role: string }
type NoteTags = { tagged_patient_id: string | null; tagged_caregiver_id: string | null; content: string }
class AccessError extends Error {}
const platform = (actor: Actor) => actor.role === 'admin' || actor.role === 'expert'
const isApplication = (type: string) => type.startsWith('application')
const message = (error: unknown) => error instanceof AccessError ? error.message : 'Unable to save internal note'

async function withWriter<T>(run: (actor: Actor) => Promise<T>): Promise<T> {
  const session = await getSession()
  if (!session || !z.uuid().safeParse(session.user.id).success) throw new AccessError('Not authenticated')
  return withActorContext(session.user.id, async () => {
    const [actor] = await sql<Actor[]>`SELECT id,role FROM public.user_profiles
      WHERE id=${session.user.id}::uuid AND is_active=true
      AND role IN ('admin','expert','company_owner','care_coordinator')`
    if (!actor) throw new AccessError('Forbidden')
    await sql`SELECT set_config('app.current_user_role',${actor.role},true)`
    return run(actor)
  })
}

function subjectScope(type: InternalNoteSubjectType, subjectId: string) {
  return sql`
    SELECT agency_id,NULL::uuid application_id FROM public.patients WHERE ${type}='patient' AND id=${subjectId}::uuid
    UNION ALL SELECT agency_id,NULL::uuid FROM public.caregiver_members WHERE ${type}='caregiver' AND id=${subjectId}::uuid
    UNION ALL SELECT agency_id,NULL::uuid FROM public.scheduled_visits WHERE ${type}='visit' AND id=${subjectId}::uuid
    UNION ALL SELECT agency_id,id FROM public.applications WHERE ${type}='application' AND id=${subjectId}::uuid
    UNION ALL SELECT a.agency_id,a.id FROM public.application_steps s JOIN public.applications a ON a.id=s.application_id WHERE ${type}='application_step' AND s.id=${subjectId}::uuid
    UNION ALL SELECT a.agency_id,a.id FROM public.application_documents s JOIN public.applications a ON a.id=s.application_id WHERE ${type}='application_document' AND s.id=${subjectId}::uuid
    UNION ALL SELECT a.agency_id,a.id FROM public.application_playbook_items s JOIN public.applications a ON a.id=s.application_id WHERE ${type}='application_playbook_item' AND s.id=${subjectId}::uuid`
}

async function authorize(actor: Actor, input: { agencyId:string; subjectType:InternalNoteSubjectType; subjectId:string; applicationId?:string|null; taggedPatientId?:string|null; taggedCaregiverId?:string|null }) {
  if (isApplication(input.subjectType) !== platform(actor)) throw new AccessError('Forbidden')
  if (!platform(actor)) {
    const [membership] = await sql`SELECT 1 FROM public.user_agency_roles WHERE user_id=${actor.id}::uuid
      AND agency_id=${input.agencyId}::uuid AND role=${actor.role} AND status='active' LIMIT 1`
    if (!membership) throw new AccessError('Forbidden')
  }
  await sql`SELECT set_config('app.current_agency_id',${input.agencyId},true)`
  const scopes=await sql`SELECT * FROM (${subjectScope(input.subjectType,input.subjectId)}) s
    WHERE agency_id=${input.agencyId}::uuid
    AND (${input.applicationId ?? null}::uuid IS NULL OR application_id=${input.applicationId ?? null}::uuid)`
  if (scopes.length !== 1) throw new AccessError('Subject not found or not authorized')
  if (isApplication(input.subjectType) && (input.taggedPatientId || input.taggedCaregiverId)) throw new AccessError('Application notes cannot tag people')
  if (input.taggedPatientId && !(await sql`SELECT 1 FROM public.patients WHERE id=${input.taggedPatientId}::uuid AND agency_id=${input.agencyId}::uuid`).length)
    throw new AccessError('Tagged record not found or not authorized')
  if (input.taggedCaregiverId && !(await sql`SELECT 1 FROM public.caregiver_members WHERE id=${input.taggedCaregiverId}::uuid AND agency_id=${input.agencyId}::uuid`).length)
    throw new AccessError('Tagged record not found or not authorized')
}

async function audit(actor:Actor, agencyId:string, noteId:string, action:string, details:Record<string,unknown>) {
  await sql`INSERT INTO public.audit_log(agency_id,table_name,record_id,action,performed_by_user_id,details)
    VALUES (${agencyId}::uuid,'internal_notes',${noteId}::uuid,${action},${actor.id}::uuid,${JSON.stringify(details)}::jsonb)`
}

export async function createInternalNote(input: NoteCreateInput): Promise<{error:string|null;id?:string}> {
  try {
    const parsed=noteCreateSchema.safeParse(input); if(!parsed.success) return {error:parsed.error.issues[0]?.message ?? 'Invalid input'}
    const data=parsed.data
    return await withWriter(async actor=>{
      await authorize(actor,data)
      const [row]=await sql<{id:string}[]>`INSERT INTO public.internal_notes
        (agency_id,subject_type,subject_id,content,created_by,tagged_patient_id,tagged_caregiver_id)
        VALUES (${data.agencyId}::uuid,${data.subjectType},${data.subjectId}::uuid,${data.content},${actor.id}::uuid,
          ${data.taggedPatientId ?? null}::uuid,${data.taggedCaregiverId ?? null}::uuid) RETURNING id`
      if(!row) throw new Error('insert returned no row')
      await audit(actor,data.agencyId,row.id,'INSERT',{subject_type:data.subjectType,subject_id:data.subjectId,
        tagged_patient:Boolean(data.taggedPatientId),tagged_caregiver:Boolean(data.taggedCaregiverId),content_length:data.content.length})
      return {error:null,id:row.id}
    })
  } catch(error) { return {error:message(error)} }
}

export async function updateInternalNote(input: NoteUpdateInput): Promise<{error:string|null;oldTaggedPatientId?:string|null;oldTaggedCaregiverId?:string|null}> {
  try {
    const parsed=noteUpdateSchema.safeParse(input); if(!parsed.success) return {error:parsed.error.issues[0]?.message ?? 'Invalid input'}
    const data=parsed.data
    return await withWriter(async actor=>{
      await authorize(actor,data)
      const [old]=await sql<NoteTags[]>`SELECT content,tagged_patient_id,tagged_caregiver_id FROM public.internal_notes
        WHERE id=${data.noteId}::uuid AND agency_id=${data.agencyId}::uuid AND subject_type=${data.subjectType} AND subject_id=${data.subjectId}::uuid FOR UPDATE`
      if(!old) throw new AccessError('Note not found or not authorized')
      const rows=await sql`UPDATE public.internal_notes SET content=${data.content},updated_by=${actor.id}::uuid,updated_at=now(),
        tagged_patient_id=${data.taggedPatientId ?? null}::uuid,tagged_caregiver_id=${data.taggedCaregiverId ?? null}::uuid
        WHERE id=${data.noteId}::uuid RETURNING id`
      if(!rows.length) throw new AccessError('Note not found or not authorized')
      await audit(actor,data.agencyId,data.noteId,'UPDATE',{subject_type:data.subjectType,subject_id:data.subjectId,
        old_content_length:old.content.length,new_content_length:data.content.length,
        tagged_patient_changed:old.tagged_patient_id!==(data.taggedPatientId ?? null),tagged_caregiver_changed:old.tagged_caregiver_id!==(data.taggedCaregiverId ?? null)})
      return {error:null,oldTaggedPatientId:old.tagged_patient_id,oldTaggedCaregiverId:old.tagged_caregiver_id}
    })
  } catch(error) { return {error:message(error)} }
}

export async function deleteInternalNote(input: NoteDeleteInput): Promise<{error:string|null;taggedPatientId?:string|null;taggedCaregiverId?:string|null}> {
  try {
    const parsed=noteDeleteSchema.safeParse(input); if(!parsed.success) return {error:parsed.error.issues[0]?.message ?? 'Invalid input'}
    const data=parsed.data
    return await withWriter(async actor=>{
      await authorize(actor,data)
      const [old]=await sql<NoteTags[]>`SELECT content,tagged_patient_id,tagged_caregiver_id FROM public.internal_notes
        WHERE id=${data.noteId}::uuid AND agency_id=${data.agencyId}::uuid AND subject_type=${data.subjectType} AND subject_id=${data.subjectId}::uuid FOR UPDATE`
      if(!old) throw new AccessError('Note not found or not authorized')
      await audit(actor,data.agencyId,data.noteId,'DELETE',{subject_type:data.subjectType,subject_id:data.subjectId,
        content_length:old.content.length,tagged_patient:Boolean(old.tagged_patient_id),tagged_caregiver:Boolean(old.tagged_caregiver_id)})
      const rows=await sql`DELETE FROM public.internal_notes WHERE id=${data.noteId}::uuid RETURNING id`
      if(!rows.length) throw new Error('delete returned no row')
      return {error:null,taggedPatientId:old.tagged_patient_id,taggedCaregiverId:old.tagged_caregiver_id}
    })
  } catch(error) { return {error:message(error)} }
}

const applicationStatusSchema=z.object({
  applicationId:z.uuid(),
  operation:z.enum(['close','complete','reopen']),
  reason:z.string().trim().min(1,'Reason is required').max(9000,'Reason is too long'),
}).strict()

/** Application state, its audit, status note and note audit commit as one unit. */
export async function changeApplicationStatusWithNote(input:z.input<typeof applicationStatusSchema>):Promise<{error:string|null}> {
  try {
    const parsed=applicationStatusSchema.safeParse(input)
    if(!parsed.success) return {error:parsed.error.issues[0]?.message ?? 'Invalid input'}
    const data=parsed.data
    return await withWriter(async actor=>{
      if(!platform(actor)) throw new AccessError('Forbidden')
      const [app]=await sql<{id:string;agency_id:string|null;status:string}[]>`
        SELECT id,agency_id,status FROM public.applications WHERE id=${data.applicationId}::uuid FOR UPDATE`
      if(!app) throw new AccessError('Application not found')
      if(!app.agency_id) throw new AccessError('Application has no agency')
      if(data.operation==='reopen' ? !['closed','complete'].includes(app.status) : ['approved','rejected'].includes(app.status))
        throw new AccessError(data.operation==='reopen'?'Application is not closed or complete':'Cannot change an approved or rejected application')
      await sql`SELECT set_config('app.current_agency_id',${app.agency_id},true)`
      const today=new Date().toISOString().slice(0,10)
      let nextStatus:string
      if(data.operation==='close'){
        nextStatus='closed'
        await sql`UPDATE public.applications SET status='closed',closed_by=${actor.id}::uuid,closed_at=now(),
          close_reason=${data.reason},last_updated_date=${today} WHERE id=${app.id}::uuid`
      }else if(data.operation==='complete'){
        nextStatus='under_review'
        await sql`UPDATE public.applications SET status='under_review',completed_by=${actor.id}::uuid,completed_at=now(),
          complete_reason=${data.reason},last_updated_date=${today} WHERE id=${app.id}::uuid`
      }else{
        nextStatus='in_progress'
        await sql`UPDATE public.applications SET status='in_progress',closed_by=NULL,closed_at=NULL,close_reason=NULL,
          completed_by=NULL,completed_at=NULL,complete_reason=NULL,last_updated_date=${today} WHERE id=${app.id}::uuid`
      }
      await sql`INSERT INTO public.audit_log(agency_id,table_name,record_id,action,performed_by_user_id,details)
        VALUES (${app.agency_id}::uuid,'applications',${app.id}::uuid,'UPDATE',${actor.id}::uuid,
          ${JSON.stringify({operation:data.operation,old_status:app.status,new_status:nextStatus,reason_length:data.reason.length})}::jsonb)`
      const noteContent=data.operation==='close'?'Application manually closed. Reason: '+data.reason
        :data.operation==='complete'?'Application marked complete. Notes: '+data.reason
        :'Application re-opened. Reason: '+data.reason
      const [note]=await sql<{id:string}[]>`INSERT INTO public.internal_notes
        (agency_id,subject_type,subject_id,content,created_by)
        VALUES (${app.agency_id}::uuid,'application',${app.id}::uuid,${noteContent},${actor.id}::uuid) RETURNING id`
      if(!note) throw new Error('note insert returned no row')
      await audit(actor,app.agency_id,note.id,'INSERT',{subject_type:'application',subject_id:app.id,content_length:noteContent.length})
      return {error:null}
    })
  }catch(error){return {error:message(error)}}
}
