import React from 'react'
import { toast } from 'sonner'

const FIELD_LABELS: Record<string, string> = {
  // Agency
  name: 'Agency Name',
  phone: 'Phone',
  fax: 'Fax',
  email: 'Email',
  website: 'Website',
  ein_number: 'EIN Number',
  address: 'Address',
  city: 'City',
  state: 'State',
  zip_code: 'Zip Code',
  primary_contact_first_name: 'Contact First Name',
  primary_contact_last_name: 'Contact Last Name',
  // Staff / Users
  first_name: 'First Name',
  last_name: 'Last Name',
  role: 'Role',
  password: 'Password',
  // Applications / Programs
  application_name: 'Application Name',
  playbook_id: 'Program Type',
  agency_id: 'Agency',
  // Certifications / Licenses
  license_number: 'License Number',
  expiry_date: 'Expiry Date',
  issue_date: 'Issue Date',
  category_id: 'Category',
  // Patients / Clients
  dob: 'Date of Birth',
  // Leads
  source: 'Lead Source',
  // Misc
  description: 'Description',
  start_date: 'Start Date',
  end_date: 'End Date',
  amount: 'Amount',
  notes: 'Notes',
}

function humanize(key: string): string {
  return FIELD_LABELS[key] ?? key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

type ValidationState = {
  success?: boolean
  error?: string | null
  fieldErrors?: Record<string, string[]>
}

export function showValidationToast(state: ValidationState): void {
  if (state.fieldErrors && Object.keys(state.fieldErrors).length > 0) {
    const description = React.createElement(
      'ul',
      { style: { margin: '4px 0 0 0', padding: 0, listStyle: 'none' } },
      ...Object.entries(state.fieldErrors).map(([field, msgs]) =>
        React.createElement(
          'li',
          { key: field, style: { display: 'flex', gap: '6px', marginTop: '4px', color: '#111827', fontSize: '13px' } },
          React.createElement('span', { style: { flexShrink: 0 } }, '•'),
          React.createElement('span', null, `${humanize(field)}: ${msgs[0]}`)
        )
      )
    )
    toast.error('Please complete required fields before submitting', { description, duration: 8000 })
    return
  }
  if (state.error) {
    toast.error(state.error, { duration: 6000 })
  }
}

export function showSuccessToast(message: string): void {
  toast.success(message, { duration: 4000 })
}
