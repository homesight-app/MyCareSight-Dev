export interface StateField {
  key: string
  label: string
  type: 'text' | 'select' | 'boolean' | 'date'
  options?: string[]
  publicForm: boolean
  required?: boolean
}

export const STATE_AGENCY_CONFIGS: Record<string, StateField[]> = {
  FL: [
    {
      key: 'ahca_region',
      label: 'AHCA Region',
      type: 'select',
      publicForm: true,
      options: [
        'Region 1', 'Region 2', 'Region 3', 'Region 4', 'Region 5',
        'Region 6', 'Region 7', 'Region 8', 'Region 9', 'Region 10', 'Region 11',
      ],
    },
    { key: 'is_on_cap', label: 'Agency is on CAP', type: 'boolean', publicForm: true },
  ],
}
