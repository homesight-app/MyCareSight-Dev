/** @jest-environment jsdom */

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import CreateLicenseModal from '@/components/CreateLicenseModal'
import { createLicenseForAgency } from '@/app/actions/licenses'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: jest.fn() }),
}))
jest.mock('next-auth/react', () => ({
  useSession: () => ({ data: null }),
}))
jest.mock('@/app/actions/query-bridge', () => ({
  insertLicenseReturning: jest.fn(),
  updateLicenseById: jest.fn(),
}))
jest.mock('@/app/actions/licenses', () => ({
  createLicenseForAgency: jest.fn(),
  createCertificationAndLink: jest.fn(),
  linkProgramToCertification: jest.fn(),
  revalidateLicensesPage: jest.fn(),
}))
jest.mock('@/app/actions/license-documents', () => ({
  uploadLicenseDocumentAction: jest.fn(),
  uploadLicenseDocumentsForCreationAction: jest.fn(),
  removeUploadedLicenseFilesAction: jest.fn(),
}))
jest.mock('@/lib/form-validation-toast', () => ({
  showValidationToast: jest.fn(),
  showSuccessToast: jest.fn(),
}))

const AGENCY_ID = '30000000-0000-4000-8000-000000000001'
const CATEGORY_ID = '30000000-0000-4000-8000-000000000002'

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(createLicenseForAgency).mockResolvedValue({
    error: null,
    data: { id: '30000000-0000-4000-8000-000000000003' },
  })
})

test('shows Category before creation and submits the selected category id', async () => {
  render(
    <CreateLicenseModal
      isOpen
      onClose={jest.fn()}
      onSuccess={jest.fn()}
      agencyId={AGENCY_ID}
      agencyName="Synthetic Agency"
      categoryOptions={[{ id: CATEGORY_ID, name: 'State License' }]}
    />
  )

  expect(screen.getByLabelText(/Category/)).toBeInTheDocument()

  fireEvent.change(screen.getByLabelText(/License Name/), { target: { value: 'Synthetic License' } })
  fireEvent.change(screen.getByLabelText(/Category/), { target: { value: CATEGORY_ID } })
  fireEvent.change(screen.getByLabelText(/Activated Date/), { target: { value: '2026-01-01' } })
  fireEvent.change(screen.getByLabelText(/Expiry Date/), { target: { value: '2027-01-01' } })
  fireEvent.click(screen.getByRole('button', { name: 'Add License' }))

  await waitFor(() => expect(createLicenseForAgency).toHaveBeenCalledTimes(1))
  expect(jest.mocked(createLicenseForAgency).mock.calls[0][0]).toMatchObject({
    agencyId: AGENCY_ID,
    license_name: 'Synthetic License',
    category_id: CATEGORY_ID,
  })
})
