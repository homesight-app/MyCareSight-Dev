export interface TemplateVariable {
  key: string
  label: string
  dbPath?: string
  computed?: boolean
}

export interface TemplateVariableNamespace {
  key: string
  label: string
  variables: TemplateVariable[]
}

export const TEMPLATE_VARIABLE_NAMESPACES: TemplateVariableNamespace[] = [
  {
    key: 'lead',
    label: 'Lead',
    variables: [
      { key: 'lead.first_name',      label: 'First Name',       dbPath: 'leads.contact_first_name' },
      { key: 'lead.last_name',       label: 'Last Name',        dbPath: 'leads.contact_last_name' },
      { key: 'lead.email',           label: 'Email',            dbPath: 'leads.contact_email' },
      { key: 'lead.phone',           label: 'Phone',            dbPath: 'leads.contact_phone' },
      { key: 'lead.company_name',    label: 'Company Name',     dbPath: 'leads.company_name' },
      { key: 'lead.service_type',    label: 'Service Type',     dbPath: 'leads.service_type' },
      { key: 'lead.price',           label: 'Price',            dbPath: 'leads.price' },
      { key: 'lead.retainer_amount', label: 'Retainer Amount',  dbPath: 'leads.retainer_amount' },
      { key: 'lead.signed_date',     label: 'Signed Date',      dbPath: 'leads.signed_date' },
      { key: 'lead.address1',        label: 'Address Line 1',   dbPath: 'leads.contact_address1' },
      { key: 'lead.address2',        label: 'Address Line 2',   dbPath: 'leads.contact_address2' },
      { key: 'lead.city',            label: 'City',             dbPath: 'leads.contact_city' },
      { key: 'lead.state',           label: 'State',            dbPath: 'leads.contact_state' },
      { key: 'lead.zip',             label: 'ZIP Code',         dbPath: 'leads.contact_zip' },
    ],
  },
  {
    key: 'agency',
    label: 'Agency',
    variables: [
      { key: 'agency.name',    label: 'Agency Name', dbPath: 'agencies.name' },
      { key: 'agency.address', label: 'Address',     dbPath: 'agencies.address' },
      { key: 'agency.city',    label: 'City',        dbPath: 'agencies.city' },
      { key: 'agency.state',   label: 'State',       dbPath: 'agencies.state' },
      { key: 'agency.zip',     label: 'ZIP Code',    dbPath: 'agencies.zip' },
      { key: 'agency.phone',   label: 'Phone',       dbPath: 'agencies.phone' },
      { key: 'agency.email',   label: 'Email',       dbPath: 'agencies.email' },
    ],
  },
  {
    key: 'caregiver',
    label: 'Caregiver / Staff',
    variables: [
      { key: 'caregiver.first_name',  label: 'First Name',  dbPath: 'user_profiles.first_name' },
      { key: 'caregiver.last_name',   label: 'Last Name',   dbPath: 'user_profiles.last_name' },
      { key: 'caregiver.email',       label: 'Email',       dbPath: 'user_profiles.email' },
      { key: 'caregiver.phone',       label: 'Phone',       dbPath: 'user_profiles.phone' },
      { key: 'caregiver.role',        label: 'Role',        dbPath: 'user_profiles.role' },
      { key: 'caregiver.start_date',  label: 'Start Date',  dbPath: 'tbd' },
    ],
  },
  {
    key: 'company',
    label: 'Company (MyCareSight)',
    variables: [
      { key: 'company.name',    label: 'Company Name'    },
      { key: 'company.phone',   label: 'Company Phone'   },
      { key: 'company.email',   label: 'Company Email'   },
      { key: 'company.website', label: 'Company Website' },
      { key: 'company.address', label: 'Company Address' },
    ],
  },
  {
    key: 'system',
    label: 'System',
    variables: [
      { key: 'system.date', label: "Today's Date", computed: true },
      { key: 'system.year', label: 'Current Year', computed: true },
    ],
  },
]

export const TEMPLATE_CATEGORIES = [
  { key: 'invoice',       label: 'Invoice'       },
  { key: 'contract',      label: 'Contract'      },
  { key: 'hr',            label: 'HR'            },
  { key: 'communication', label: 'Communication' },
  { key: 'onboarding',    label: 'Onboarding'    },
  { key: 'other',         label: 'Other'         },
] as const

export type TemplateCategory = typeof TEMPLATE_CATEGORIES[number]['key']

export const TEMPLATE_TYPES = [
  { key: 'document', label: 'Document' },
  { key: 'email',    label: 'Email'    },
] as const

export type TemplateType = typeof TEMPLATE_TYPES[number]['key']
