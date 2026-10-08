/** @jest-environment jsdom */

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import CertificationDetailModal, { type CertLicense } from '@/components/CertificationDetailModal'
import { updateCertificationDetails } from '@/app/actions/licenses'
import { getAvailableProgramsForCert, getCertificationVersionHistory } from '@/app/actions/licenses'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: jest.fn() }),
}))
jest.mock('@/app/actions/licenses', () => ({
  updateCertificationDetails: jest.fn(),
  deleteLicenseDocument: jest.fn(),
  linkProgramToCertification: jest.fn(),
  unlinkProgramFromCertification: jest.fn(),
  getAvailableProgramsForCert: jest.fn(),
  getCertificationVersionHistory: jest.fn(),
}))
jest.mock('@/app/actions/license-documents', () => ({ uploadLicenseDocumentAction: jest.fn() }))
jest.mock('@/lib/storage', () => ({
  createSignedStorageUrl: jest.fn(),
  STORAGE_BUCKET: { APPLICATION: 'application-documents' },
}))

const AGENCY_ID = '10000000-0000-4000-8000-000000000001'
const LICENSE_ID = '10000000-0000-4000-8000-000000000002'
const STATE_LICENSE_ID = '10000000-0000-4000-8000-000000000003'
const MEDICARE_ID = '10000000-0000-4000-8000-000000000004'

const license: CertLicense = {
  id: LICENSE_ID,
  license_name: 'Synthetic Certification',
  license_number: 'SYN-100',
  state: 'California',
  status: 'active',
  activated_date: '2025-08-04',
  expiry_date: '2026-08-11',
  renewal_due_date: '2026-08-18',
  issuing_body: 'Synthetic Authority',
  category_id: STATE_LICENSE_ID,
  category: { id: STATE_LICENSE_ID, name: 'State License' },
  created_at: '2026-01-01T00:00:00.000Z',
  license_documents: [],
  certification_applications: [],
}

const categoryOptions = [
  { id: STATE_LICENSE_ID, name: 'State License' },
  { id: MEDICARE_ID, name: 'Medicare' },
]

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(updateCertificationDetails).mockResolvedValue({ success: true })
  jest.mocked(getAvailableProgramsForCert).mockResolvedValue({ error: null, data: [] })
  jest.mocked(getCertificationVersionHistory).mockResolvedValue({ error: null, data: [] })
})

test('submits the configured category id instead of the removed legacy category field', async () => {
  render(
    <CertificationDetailModal
      license={license}
      agencyId={AGENCY_ID}
      backPath="/synthetic"
      categoryOptions={categoryOptions}
      canEdit
      onClose={jest.fn()}
    />
  )

  fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
  fireEvent.change(screen.getByLabelText('Category'), { target: { value: MEDICARE_ID } })
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))

  await waitFor(() => expect(updateCertificationDetails).toHaveBeenCalledTimes(1))
  const submitted = jest.mocked(updateCertificationDetails).mock.calls[0][2]
  expect(submitted.category_id).toBe(MEDICARE_ID)
  expect(submitted).not.toHaveProperty('certification_category')
})

test('uses shared client validation and displays server field errors inline', async () => {
  jest.mocked(updateCertificationDetails).mockResolvedValueOnce({
    success: false,
    error: 'Check the highlighted fields.',
    fieldErrors: { category_id: ['Select a valid category'] },
  })

  render(
    <CertificationDetailModal
      license={license}
      agencyId={AGENCY_ID}
      backPath="/synthetic"
      categoryOptions={categoryOptions}
      canEdit
      onClose={jest.fn()}
    />
  )

  fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
  fireEvent.change(screen.getByLabelText(/Certification Name/), { target: { value: '' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  expect(await screen.findByText('Certification name is required')).toBeInTheDocument()
  expect(updateCertificationDetails).not.toHaveBeenCalled()

  fireEvent.change(screen.getByLabelText(/Certification Name/), { target: { value: 'Synthetic Updated Certification' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  expect(await screen.findByText('Select a valid category')).toBeInTheDocument()
})
