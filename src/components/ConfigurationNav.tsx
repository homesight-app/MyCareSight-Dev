import Link from 'next/link'
import { Award, BookOpen, ClipboardList, DollarSign, Shield, Users } from 'lucide-react'

const NAV_ITEMS = [
  {
    key: 'pricing',
    label: 'User License Pricing',
    description: 'Monthly subscription costs per user type',
    icon: DollarSign,
  },
  {
    key: 'license-types',
    label: 'License Types',
    description: 'Fees and processing times by state',
    icon: Shield,
  },
  {
    key: 'certification-types',
    label: 'Certification Types',
    description: 'Staff credential and certification options',
    icon: Award,
  },
  {
    key: 'staff-roles',
    label: 'Staff Roles',
    description: 'Job titles and caregiver role definitions',
    icon: Users,
  },
  {
    key: 'task-catalog',
    label: 'Task Catalog',
    description: 'Skilled and non-skilled task definitions',
    icon: ClipboardList,
  },
  {
    key: 'playbook-categories',
    label: 'Playbook Categories',
    description: 'Categories for playbooks and programs',
    icon: BookOpen,
  },
]

interface ConfigurationNavProps {
  activeSection: string
}

export default function ConfigurationNav({ activeSection }: ConfigurationNavProps) {
  return (
    <div className="bg-white rounded-xl shadow-md border border-gray-100 p-3 w-60 shrink-0 sticky top-6 self-start">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-3 pb-2 mb-1">
        Categories
      </p>
      <nav className="space-y-0.5">
        {NAV_ITEMS.map(({ key, label, description, icon: Icon }) => {
          const isActive = activeSection === key
          return (
            <Link
              key={key}
              href={`?section=${key}`}
              replace
              className={`flex items-start gap-3 rounded-lg text-sm transition-colors ${
                isActive
                  ? 'bg-gray-50 border-l-2 border-teal-500 text-gray-900 font-medium px-[10px] py-2.5'
                  : 'border-l-2 border-transparent text-gray-600 hover:bg-gray-50 hover:text-gray-900 px-3 py-2.5'
              }`}
            >
              <Icon
                className={`w-4 h-4 mt-0.5 shrink-0 ${isActive ? 'text-teal-600' : 'text-gray-400'}`}
              />
              <div className="min-w-0">
                <div className="truncate">{label}</div>
                <div className="text-xs text-gray-400 font-normal truncate mt-0.5">{description}</div>
              </div>
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
