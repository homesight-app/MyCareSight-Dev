/** @jest-environment jsdom */

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import ProgramItemDetailModal from '@/components/ProgramItemDetailModal'
import ApplicationRequirementsTab from '@/components/ApplicationRequirementsTab'
import {
  getApplicationProgramItems,
  getProgramItemDocuments,
  getProgramItemNoteCounts,
  getProgramItemRuleChecks,
  getValidationHistory,
  getLatestValidationSummary,
  migrateApplicationToProgram,
} from '@/app/actions/playbooks'
import type { ApplicationPlaybookItem } from '@/lib/supabase/query/playbooks'

jest.mock('@/lib/storage', () => ({
  createSignedStorageUrl: jest.fn(),
  STORAGE_BUCKET: { APPLICATION: 'application-documents' },
}))

jest.mock('@/components/InternalNotesPanel', () => ({
  __esModule: true,
  default: () => <div>Internal notes panel</div>,
}))

jest.mock('@/components/UploadDocumentModal', () => ({
  __esModule: true,
  default: () => null,
}))

jest.mock('@/app/actions/playbooks', () => ({
  getApplicationProgramItems: jest.fn(),
  getProgramItemDocuments: jest.fn(),
  getProgramItemNoteCounts: jest.fn(),
  getProgramItemRuleChecks: jest.fn(),
  getAgencyFieldValues: jest.fn().mockResolvedValue({ error: null, agency: null }),
  getValidationHistory: jest.fn(),
  getValidationRuleLibrary: jest.fn().mockResolvedValue({ error: null, rules: [] }),
  getLatestValidationSummary: jest.fn(),
  migrateApplicationToProgram: jest.fn(),
  applyPlaybookToApplication: jest.fn(),
  updateProgramItem: jest.fn(),
  addApplicationItemRule: jest.fn(),
  removeApplicationItemRule: jest.fn(),
  runDocumentValidation: jest.fn(),
  saveValidationRun: jest.fn(),
  deleteApplicationDocument: jest.fn(),
  sendBackProgramItem: jest.fn(),
  submitProgramItem: jest.fn(),
}))

const item = {
  id: '70000000-0000-4000-8000-000000000020',
  application_id: '70000000-0000-4000-8000-000000000010',
  playbook_item_id: null,
  item_order: 1,
  item_type: 'document',
  name: 'Synthetic Requirement',
  description: 'Synthetic description',
  instructions: null,
  document_type: 'pdf',
  phase: null,
  assignment: 'client',
  requirement_type: 'required',
  status: 'approved',
  due_date: null,
  notes: null,
  updated_by: null,
  approved_at: null,
  approved_by: null,
  source_application_step_id: null,
  source_application_document_id: null,
  source_license_requirement_document_id: null,
  created_at: '2026-10-14T12:00:00.000Z',
  updated_at: '2026-10-14T12:00:00.000Z',
} as ApplicationPlaybookItem

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(getProgramItemDocuments).mockResolvedValue({ error: null, documents: [] })
  jest.mocked(getProgramItemRuleChecks).mockResolvedValue({ error: null, checks: [] })
  jest.mocked(getValidationHistory).mockResolvedValue({ error: null, runs: [] })
  jest.mocked(getLatestValidationSummary).mockResolvedValue(null)
  jest.mocked(getApplicationProgramItems).mockResolvedValue({ error: null, items: [item] })
  jest.mocked(getProgramItemNoteCounts).mockResolvedValue({ [item.id]: 1 })
  jest.mocked(migrateApplicationToProgram).mockResolvedValue({ error: null, count: 1 })
})

test('agency users do not receive staff tabs or editable status controls', async () => {
  render(
    <ProgramItemDetailModal
      item={item}
      agencyId={item.application_id}
      isStaff={false}
      defaultTab="notes"
      inline
      onClose={jest.fn()}
      onItemUpdated={jest.fn()}
    />
  )

  await waitFor(() => expect(getProgramItemDocuments).toHaveBeenCalledWith(item.id))
  expect(screen.queryByRole('tab', { name: 'Notes' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Validation/ })).not.toBeInTheDocument()
  expect(screen.queryByText('Internal notes panel')).not.toBeInTheDocument()
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  expect(screen.getByText('Approved')).toBeInTheDocument()
})

test('platform staff retain internal notes and validation controls', async () => {
  render(
    <ProgramItemDetailModal
      item={item}
      agencyId={item.application_id}
      isStaff
      inline
      onClose={jest.fn()}
      onItemUpdated={jest.fn()}
    />
  )

  const notesTab = await screen.findByRole('tab', { name: 'Notes' })
  expect(screen.getByRole('tab', { name: 'Validation' })).toBeInTheDocument()
  expect(screen.getByRole('combobox')).toBeInTheDocument()
  fireEvent.click(notesTab)
  expect(screen.getByText('Internal notes panel')).toBeInTheDocument()
})

test('agency checklist does not invoke or render staff-only note and migration features', async () => {
  render(
    <ApplicationRequirementsTab
      applicationId={item.application_id}
      agencyId={item.application_id}
      isStaff={false}
    />
  )

  await screen.findByText('Synthetic Requirement')
  expect(migrateApplicationToProgram).not.toHaveBeenCalled()
  expect(getProgramItemNoteCounts).not.toHaveBeenCalled()
  expect(screen.queryByText('Notes')).not.toBeInTheDocument()
  expect(screen.queryByTitle('View notes')).not.toBeInTheDocument()
  expect(screen.queryByRole('option', { name: 'Expert' })).not.toBeInTheDocument()
})
