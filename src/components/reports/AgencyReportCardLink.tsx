'use client'

import Link from 'next/link'
import { Award, AlertTriangle, DollarSign, FileText, GitBranch, Users, type LucideIcon } from 'lucide-react'

const ICONS: Record<'dollar-sign' | 'award' | 'alert-triangle' | 'git-branch' | 'users', LucideIcon> = {
  'dollar-sign': DollarSign,
  award: Award,
  'alert-triangle': AlertTriangle,
  'git-branch': GitBranch,
  users: Users,
}

export type AgencyReportCardIconKey = keyof typeof ICONS

type Props = {
  href: string
  title: string
  description: string
  icon: AgencyReportCardIconKey
  iconColor: string
  iconTextColor: string
}

export default function AgencyReportCardLink({ href, title, description, icon, iconColor, iconTextColor }: Props) {
  const Icon = ICONS[icon]

  return (
    <Link
      href={href}
      className="bg-white rounded-xl p-6 shadow-md border border-gray-100 hover:shadow-lg transition-shadow"
    >
      <div className="flex flex-col h-full">
        <div className={`w-12 h-12 ${iconColor} rounded-lg flex items-center justify-center mb-4`}>
          <Icon className={`w-6 h-6 ${iconTextColor}`} />
        </div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
        <p className="text-sm text-gray-600 mb-4 flex-1">{description}</p>
        <span className="w-full px-4 py-2 bg-white border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors flex items-center justify-center gap-2 text-sm">
          <FileText className="w-4 h-4" />
          Generate Report
        </span>
      </div>
    </Link>
  )
}
