/** @jest-environment jsdom */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import InternalNotesPanel from '@/components/InternalNotesPanel'
import { getInternalNotesPanelDataAction, logNoteSearchAction } from '@/app/actions/internal-notes'

jest.mock('@/app/actions/internal-notes',()=>({
  getInternalNotesPanelDataAction:jest.fn(),
  logNoteSearchAction:jest.fn(),
  addInternalNoteAction:jest.fn(),
  editInternalNoteAction:jest.fn(),
  deleteInternalNoteAction:jest.fn(),
}))
const SUBJECT='70000000-0000-4000-8000-000000000020'
const OTHER='70000000-0000-4000-8000-000000000021'
const AGENCY='70000000-0000-4000-8000-000000000010'
type PanelResult=Awaited<ReturnType<typeof getInternalNotesPanelDataAction>>
const empty:PanelResult={error:null,notes:[],associatedNotes:[],patients:[],caregivers:[]}
const note=(id:string,content:string)=>({
  id,agency_id:AGENCY,subject_id:SUBJECT,subject_type:'patient' as const,content,
  created_at:'2026-09-22T12:00:00Z',updated_at:'2026-09-22T12:00:00Z',created_by:SUBJECT,updated_by:null,
  tagged_patient_id:null,tagged_caregiver_id:null,author:{full_name:'Synthetic Author'},updater:null,
  tagged_patient:null,tagged_caregiver:null,
})
beforeEach(()=>{
  jest.resetAllMocks()
  jest.mocked(getInternalNotesPanelDataAction).mockResolvedValue(empty)
  jest.mocked(logNoteSearchAction).mockResolvedValue({success:true})
})
afterEach(()=>{jest.useRealTimers()})
test('passes subject/agency/application scope to the authorized panel boundary',async()=>{
  render(<InternalNotesPanel subjectType="application" subjectId={SUBJECT} agencyId={AGENCY} applicationId={SUBJECT} canManage={false}/>)
  await screen.findByText('No internal notes yet.')
  expect(getInternalNotesPanelDataAction).toHaveBeenCalledWith({subjectType:'application',subjectId:SUBJECT,agencyId:AGENCY,applicationId:SUBJECT})
})
test('drops a late response for a previous subject and clears notes after a denied reload',async()=>{
  let finishFirst!:(value:PanelResult)=>void
  jest.mocked(getInternalNotesPanelDataAction).mockImplementationOnce(()=>new Promise(resolve=>{finishFirst=resolve}))
    .mockResolvedValueOnce({...empty,notes:[note(OTHER,'Synthetic current note')]})
    .mockResolvedValueOnce({...empty,error:'Forbidden'})
  const {rerender}=render(<InternalNotesPanel subjectType="patient" subjectId={SUBJECT} agencyId={AGENCY} canManage={false}/>)
  rerender(<InternalNotesPanel subjectType="caregiver" subjectId={OTHER} agencyId={AGENCY} canManage={false}/>)
  await screen.findByText('Synthetic current note')
  await act(async()=>{finishFirst({...empty,notes:[note(SUBJECT,'Synthetic stale note')]})})
  expect(screen.queryByText('Synthetic stale note')).not.toBeInTheDocument()
  expect(screen.getByText('Synthetic current note')).toBeInTheDocument()
  rerender(<InternalNotesPanel subjectType="patient" subjectId={SUBJECT} agencyId={AGENCY} canManage={false}/>)
  await screen.findByText('Forbidden')
  expect(screen.queryByText('Synthetic current note')).not.toBeInTheDocument()
})
test('search auditing waits 600ms and ignores queries shorter than three characters',async()=>{
  jest.mocked(getInternalNotesPanelDataAction).mockResolvedValue({...empty,notes:[note(SUBJECT,'Synthetic searchable note')]})
  render(<InternalNotesPanel subjectType="patient" subjectId={SUBJECT} agencyId={AGENCY} canManage={false}/>)
  await screen.findByText('Synthetic searchable note')
  jest.useFakeTimers()
  const search=screen.getByPlaceholderText(/Search notes/)
  fireEvent.change(search,{target:{value:'ab'}})
  await act(async()=>{jest.advanceTimersByTime(600)})
  expect(logNoteSearchAction).not.toHaveBeenCalled()
  fireEvent.change(search,{target:{value:'Synthetic'}})
  await act(async()=>{jest.advanceTimersByTime(599)})
  expect(logNoteSearchAction).not.toHaveBeenCalled()
  await act(async()=>{jest.advanceTimersByTime(1)})
  await waitFor(()=>expect(logNoteSearchAction).toHaveBeenCalledWith({
    agencyId:AGENCY,subjectType:'patient',subjectId:SUBJECT,applicationId:null,searchTerm:'Synthetic',resultsReturned:1,
  }))
})
