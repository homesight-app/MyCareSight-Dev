export type UserRole = 'company_owner' | 'staff_member' | 'care_coordinator' | 'admin' | 'expert'

export interface User {
  id: string
  email: string
  full_name?: string
  role: UserRole
  agency_id?: string | null
  is_active: boolean
  last_login_at?: string | null
  created_at: string
  updated_at: string
}

export interface AgencyRole {
  agency_id: string
  role: 'company_owner' | 'care_coordinator' | 'staff_member'
  status: string
}

export interface AuthUser {
  id: string
  email: string
  user_metadata?: {
    full_name?: string
    role?: UserRole
  }
}


