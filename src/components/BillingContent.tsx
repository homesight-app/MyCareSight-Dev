'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { 
  Search,
  Download,
  ChevronLeft,
  ChevronRight,
  Calendar,
  DollarSign,
  Building2,
  Users,
  FileText,
  ChevronDown,
  ChevronUp,
  Eye,
  Loader2
} from 'lucide-react'

interface Agency {
  id: string
  name: string
}

interface Case {
  id: string
  case_id: string
  client_id: string
  business_name: string
  state: string
  status: string
  progress_percentage: number
  started_date: string
  last_activity: string
  documents_count: number
  steps_count: number
}

interface LicenseType {
  id: string
  name: string
  state: string
  cost_display?: string
  cost_min?: number
}

interface BaseBillingItem {
  agency: Agency
  ownerCount: number
  staffCount: number
  totalLicenses: number
  ownerLicenseFee: number
  staffLicenseFee: number
  totalLicenseFee: number
  allCases: Case[] // All cases for this agency (will be filtered by month)
}

interface BillingContentProps {
  baseBillingData: BaseBillingItem[]
  selectedMonth: number
  selectedYear: number
  activeAgencies: number
  ownerLicenseRate: number
  staffLicenseRate: number
  licenseTypes: LicenseType[]
}

export default function BillingContent({
  baseBillingData,
  selectedMonth: initialMonth,
  selectedYear: initialYear,
  activeAgencies,
  ownerLicenseRate,
  staffLicenseRate,
  licenseTypes
}: BillingContentProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedAgencies, setExpandedAgencies] = useState<Set<string>>(new Set())
  // Use local state for month/year so changes don't trigger server reload
  const [selectedMonth, setSelectedMonth] = useState(initialMonth)
  const [selectedYear, setSelectedYear] = useState(initialYear)
  
  const [isNavigatingPrevious, setIsNavigatingPrevious] = useState(false)
  const [isNavigatingNext, setIsNavigatingNext] = useState(false)

  const lastSetUrlRef = useRef<string | null>(null)

  useEffect(() => {
    // Only sync if props actually differ from current state
    if (initialMonth !== selectedMonth || initialYear !== selectedYear) {
      setSelectedMonth(initialMonth)
      setSelectedYear(initialYear)
      setIsNavigatingPrevious(false)
      setIsNavigatingNext(false)

      const urlMonth = searchParams.get('month')
      const urlYear = searchParams.get('year')
      if (urlMonth && urlYear) {
        const expectedUrl = `${parseInt(urlMonth)}-${parseInt(urlYear)}`
        if (expectedUrl === lastSetUrlRef.current) {
          lastSetUrlRef.current = null
        }
      }
    }
  }, [selectedMonth, selectedYear, initialMonth, initialYear, searchParams]) // Only depend on props, not state

  const isNavigatingRef = useRef(false)
  
  useEffect(() => {
    const urlMonth = searchParams.get('month')
    const urlYear = searchParams.get('year')
    
    if (!urlMonth || !urlYear) return
    
    const month = parseInt(urlMonth)
    const year = parseInt(urlYear)
    const currentUrl = `${month}-${year}`
    
    // If URL matches what we set, navigation is complete - reset loading state
    if (currentUrl === lastSetUrlRef.current) {
      setIsNavigatingPrevious(false)
      setIsNavigatingNext(false)
      lastSetUrlRef.current = null
      isNavigatingRef.current = false
      // Only update state if it actually differs (using functional update to avoid stale closure)
      setSelectedMonth(prev => prev !== month ? month : prev)
      setSelectedYear(prev => prev !== year ? year : prev)
      return
    }
    
    // Handle external URL changes (browser back/forward) - only if not from our navigation
    if (currentUrl !== lastSetUrlRef.current && !isNavigatingRef.current) {
      setSelectedMonth(month)
      setSelectedYear(year)
      // Reset loading state for external navigation
      setIsNavigatingPrevious(false)
      setIsNavigatingNext(false)
      lastSetUrlRef.current = null
    }
  }, [searchParams]) // Only depend on searchParams to avoid loops

  const billingData = useMemo(() => {
    const monthStart = new Date(selectedYear, selectedMonth - 1, 1)
    const monthEnd = new Date(selectedYear, selectedMonth, 0) // Last day of the month
    const monthStartStr = monthStart.toISOString().split('T')[0]
    const monthEndStr = monthEnd.toISOString().split('T')[0]

    return baseBillingData.map(baseItem => {
      // Filter cases for the selected month
      const filteredCases = baseItem.allCases.filter(c => {
        const caseDate = c.started_date.split('T')[0]
        return caseDate >= monthStartStr && caseDate <= monthEndStr
      })

      const ownerLicenseFee = baseItem.ownerCount * ownerLicenseRate
      const staffLicenseFee = baseItem.staffCount * staffLicenseRate
      const totalLicenseFee = ownerLicenseFee + staffLicenseFee

      // Calculate application fees for filtered cases
      let totalApplicationFee = 0
      let govFee = 0
      let serviceFee = 0

      filteredCases.forEach(c => {
        const matchingLicenseType = licenseTypes.find(
          lt => lt.state === c.state
        )
        
        if (matchingLicenseType) {
          const costMatch = matchingLicenseType.cost_display?.replace(/[^0-9.]/g, '')
          const appFee = costMatch ? parseFloat(costMatch) : (matchingLicenseType.cost_min || 0)
          
          // Split fee: assume 10% service fee, 90% gov fee
          const serviceFeeAmount = appFee * 0.1
          const govFeeAmount = appFee * 0.9
          
          govFee += govFeeAmount
          serviceFee += serviceFeeAmount
          totalApplicationFee += appFee
        } else {
          // Default fee if no license type found
          const defaultFee = 500
          govFee += defaultFee * 0.9
          serviceFee += defaultFee * 0.1
          totalApplicationFee += defaultFee
        }
      })

      const monthlyTotal = totalLicenseFee + totalApplicationFee

      return {
        ...baseItem,
        ownerLicenseFee,
        staffLicenseFee,
        totalLicenseFee,
        applicationsCount: filteredCases.length,
        totalApplicationFee,
        govFee,
        serviceFee,
        monthlyTotal,
        cases: filteredCases
      }
    })
  }, [baseBillingData, selectedMonth, selectedYear, licenseTypes, ownerLicenseRate, staffLicenseRate])

  // Calculate summary statistics based on filtered data
  const summary = useMemo(() => {
    const totalRevenue = billingData.reduce((sum, b) => sum + b.monthlyTotal, 0)
    const totalUserLicenses = billingData.reduce((sum, b) => sum + b.totalLicenses, 0)
    const totalOwners = billingData.reduce((sum, b) => sum + b.ownerCount, 0)
    const totalStaff = billingData.reduce((sum, b) => sum + b.staffCount, 0)
    const totalApplications = billingData.reduce((sum, b) => sum + b.applicationsCount, 0)
    const totalApplicationFees = billingData.reduce((sum, b) => sum + b.totalApplicationFee, 0)

    return {
      totalRevenue,
      activeAgencies,
      totalUserLicenses,
      totalOwners,
      totalStaff,
      totalApplications,
      totalApplicationFees
    }
  }, [billingData, activeAgencies])

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ]

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount)
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const getAgencyId = (agencyId: string) => {
    return `AG-${agencyId.substring(0, 8).toUpperCase().replace(/-/g, '')}`
  }

  const toggleAgency = (agencyId: string) => {
    const newExpanded = new Set(expandedAgencies)
    if (newExpanded.has(agencyId)) {
      newExpanded.delete(agencyId)
    } else {
      newExpanded.add(agencyId)
    }
    setExpandedAgencies(newExpanded)
  }

  const navigateMonth = (direction: 'prev' | 'next') => {
    if (isNavigatingPrevious || isNavigatingNext) return // Prevent multiple clicks during navigation

    let newMonth = selectedMonth
    let newYear = selectedYear

    if (direction === 'prev') {
      if (newMonth === 1) {
        newMonth = 12
        newYear -= 1
      } else {
        newMonth -= 1
      }
    } else {
      if (newMonth === 12) {
        newMonth = 1
        newYear += 1
      } else {
        newMonth += 1
      }
    }

    // Set loading state and navigation ref
    if (direction === 'prev') {
      setIsNavigatingPrevious(true)
    } else {
      setIsNavigatingNext(true)
    }
    isNavigatingRef.current = true
    const newUrl = `${newMonth}-${newYear}`
    lastSetUrlRef.current = newUrl

    // Update URL to trigger server reload with correct pricing for the new month
    const params = new URLSearchParams(searchParams.toString())
    params.set('month', newMonth.toString())
    params.set('year', newYear.toString())
    router.push(`/pages/admin/billing?${params.toString()}`)
  }

  const handleExportCSV = () => {
    const headers = [
      'Agency ID',
      'Agency Name',
      'Owner Licenses',
      'Staff Licenses',
      'Total Licenses',
      'License Fee',
      'Applications',
      'Application Fees',
      'Monthly Total'
    ]

    const rows = filteredBillingData.map(item => [
      getAgencyId(item.agency.id),
      item.agency.name,
      item.ownerCount.toString(),
      item.staffCount.toString(),
      item.totalLicenses.toString(),
      formatCurrency(item.totalLicenseFee),
      item.applicationsCount.toString(),
      formatCurrency(item.totalApplicationFee),
      formatCurrency(item.monthlyTotal)
    ])

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n')

    // Create and download file
    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `billing-${monthNames[selectedMonth - 1]}-${selectedYear}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    window.URL.revokeObjectURL(url)
  }

  const filteredBillingData = useMemo(() => {
    return billingData.filter(item => {
      if (!searchQuery) return true
      const query = searchQuery.toLowerCase()
      return (
        item.agency.name.toLowerCase().includes(query) ||
        getAgencyId(item.agency.id).toLowerCase().includes(query)
      )
    })
  }, [billingData, searchQuery])

  const getLicenseTypeFee = (caseItem: Case) => {
    const matchingLicenseType = licenseTypes.find(
      lt => lt.state === caseItem.state
    )
    
    if (matchingLicenseType) {
      const costMatch = matchingLicenseType.cost_display?.replace(/[^0-9.]/g, '')
      return costMatch ? parseFloat(costMatch) : (matchingLicenseType.cost_min || 0)
    }
    return 500 // Default fee
  }

  return (
    <div className="space-y-6">
      {/* Export */}
      <div className="flex justify-end">
        <button
          onClick={handleExportCSV}
          className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
        >
          <Download className="w-4 h-4" />
          Export CSV
        </button>
      </div>

      {/* Date Selector */}
      <div className="bg-white rounded-xl p-4 shadow-md border border-gray-100">
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={() => navigateMonth('prev')}
            disabled={isNavigatingPrevious}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center min-w-[40px]"
          >
            {isNavigatingPrevious ? (
              <Loader2 className="w-5 h-5 text-gray-600 animate-spin" />
            ) : (
              <ChevronLeft className="w-5 h-5 text-gray-600" />
            )}
          </button>
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-gray-400" />
            <span className="text-lg font-semibold text-gray-900">
              {monthNames[selectedMonth - 1]} {selectedYear}
            </span>
          </div>
          <button
            onClick={() => navigateMonth('next')}
            disabled={isNavigatingNext}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center min-w-[40px]"
          >
            {isNavigatingNext ? (
              <Loader2 className="w-5 h-5 text-gray-600 animate-spin" />
            ) : (
              <ChevronRight className="w-5 h-5 text-gray-600" />
            )}
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white rounded-xl p-6 shadow-md border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <DollarSign className="w-6 h-6 text-green-600" />
            </div>
          </div>
          <div className="text-2xl font-bold text-gray-900 mb-1">
            {formatCurrency(summary.totalRevenue)}
          </div>
          <div className="text-sm text-gray-600">
            For {monthNames[selectedMonth - 1]} {selectedYear}
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-md border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <Building2 className="w-6 h-6 text-blue-600" />
            </div>
          </div>
          <div className="text-2xl font-bold text-gray-900 mb-1">
            {summary.activeAgencies}
          </div>
          <div className="text-sm text-gray-600">Total agencies</div>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-md border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <Users className="w-6 h-6 text-blue-600" />
            </div>
          </div>
          <div className="text-2xl font-bold text-gray-900 mb-1">
            {summary.totalUserLicenses}
          </div>
          <div className="text-sm text-gray-600">
            {summary.totalOwners} owners, {summary.totalStaff} staff
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-md border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
              <FileText className="w-6 h-6 text-orange-600" />
            </div>
          </div>
          <div className="text-2xl font-bold text-gray-900 mb-1">
            {summary.totalApplications}
          </div>
          <div className="text-sm text-gray-600">
            Started in {monthNames[selectedMonth - 1]}
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-md border border-gray-100 bg-green-50">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <DollarSign className="w-6 h-6 text-green-600" />
            </div>
          </div>
          <div className="text-2xl font-bold text-gray-900 mb-1">
            {formatCurrency(summary.totalApplicationFees)}
          </div>
          <div className="text-sm text-gray-600">Gov + Service fees</div>
        </div>
      </div>

      {/* Search Bar */}
      <div className="bg-white rounded-xl p-4 shadow-md border border-gray-100">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Search by agency name or agency ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:bg-white"
          />
        </div>
      </div>

      {/* Agency List */}
      <div className="space-y-4">
        {filteredBillingData.length > 0 ? (
          filteredBillingData.map((item) => {
            const isExpanded = expandedAgencies.has(item.agency.id)
            const agencyId = getAgencyId(item.agency.id)

            return (
              <div
                key={item.agency.id}
                className="bg-white rounded-xl p-6 shadow-md border border-gray-100"
              >
                {/* Agency Header - Clickable to expand/collapse */}
                <div 
                  className="flex items-start justify-between cursor-pointer hover:bg-gray-50 -m-6 p-6 rounded-t-xl transition-colors"
                  onClick={() => toggleAgency(item.agency.id)}
                >
                  <div className="flex items-start gap-4 flex-1">
                    <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Building2 className="w-6 h-6 text-blue-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2 flex-wrap">
                        <h3 className="text-lg font-bold text-gray-900">
                          {item.agency.name}
                        </h3>
                        <span className="px-3 py-1 bg-green-100 text-green-800 text-xs font-semibold rounded-full">
                          {agencyId}
                        </span>
                      </div>
                      <div className="text-sm text-gray-600">
                        {item.ownerCount} agency admin{item.ownerCount !== 1 ? 's' : ''}, {item.staffCount} staff
                      </div>
                    </div>
                  </div>

                  {/* Billing Summary */}
                  <div className="flex items-center gap-6 ml-4">
                    <div className="text-right">
                      <div className="text-sm text-gray-600 mb-1">User Licenses</div>
                      <div className="text-lg font-bold text-gray-900">
                        {item.totalLicenses}
                      </div>
                      <div className="text-xs text-gray-500">
                        {item.ownerCount}A / {item.staffCount}C + {formatCurrency(item.totalLicenseFee)}/mo
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-gray-600 mb-1">Applications</div>
                      <div className="text-lg font-bold text-gray-900">
                        {item.applicationsCount}
                      </div>
                      <div className="text-xs text-gray-500">
                        {formatCurrency(item.totalApplicationFee)}
                      </div>
                    </div>
                    <div className="text-right border-l pl-6">
                      <div className="text-sm text-gray-600 mb-1">Monthly Total</div>
                      <div className="text-xl font-bold text-green-600">
                        {formatCurrency(item.monthlyTotal)}
                      </div>
                    </div>
                    <div className="p-2">
                      {isExpanded ? (
                        <ChevronUp className="w-5 h-5 text-gray-600" />
                      ) : (
                        <ChevronDown className="w-5 h-5 text-gray-600" />
                      )}
                    </div>
                  </div>
                </div>

                {/* Expanded License Applications */}
                {isExpanded && (
                  <div className="mt-6 pt-6 border-t border-gray-200">
                    <h4 className="text-sm font-semibold text-gray-700 mb-4">
                      License Applications ({item.cases.length})
                    </h4>
                    {item.cases.length > 0 ? (
                      <div className="space-y-4">
                        {item.cases.map((caseItem) => {
                        const appFee = getLicenseTypeFee(caseItem)
                        const govFee = appFee * 0.9
                        const serviceFee = appFee * 0.1
                        const progress = caseItem.progress_percentage || 0

                        return (
                          <Link
                            key={caseItem.id}
                            href={`/pages/admin/cases/${caseItem.id}`}
                            className="block border border-gray-200 rounded-lg p-4 hover:bg-gray-50 hover:shadow-md transition-all cursor-pointer"
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-2">
                                  <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs font-semibold rounded-full">
                                    {caseItem.case_id}
                                  </span>
                                  <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded-full">
                                    {caseItem.status.replace('_', ' ')}
                                  </span>
                                  <span className="px-2 py-1 bg-blue-50 text-blue-700 text-xs rounded-full">
                                    {caseItem.state}
                                  </span>
                                </div>
                                <h5 className="font-semibold text-gray-900 mb-2">
                                  {caseItem.business_name}
                                </h5>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs text-gray-600 mb-3">
                                  <div>
                                    <span className="font-medium">Started:</span> {formatDate(caseItem.started_date)}
                                  </div>
                                  <div>
                                    <span className="font-medium">Last Activity:</span> {formatDate(caseItem.last_activity)}
                                  </div>
                                  <div>
                                    <span className="font-medium">Documents:</span> {caseItem.documents_count || 0}/{caseItem.steps_count || 0}
                                  </div>
                                  <div>
                                    <span className="font-medium">Steps:</span> {caseItem.steps_count || 0}/8
                                  </div>
                                </div>
                                <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
                                  <div
                                    className="bg-gray-800 h-2 rounded-full transition-all"
                                    style={{ width: `${progress}%` }}
                                  />
                                </div>
                                <div className="text-xs text-gray-500">{progress}%</div>
                              </div>
                              <div className="ml-6 text-right">
                                <div className="mb-2">
                                  <div className="text-xs text-gray-600 mb-1">Fees</div>
                                  <div className="text-sm font-semibold text-gray-900">
                                    Gov: {formatCurrency(govFee)}
                                  </div>
                                  <div className="text-sm font-semibold text-gray-900">
                                    Service: {formatCurrency(serviceFee)}
                                  </div>
                                  <div className="text-lg font-bold text-gray-900 mt-1">
                                    {formatCurrency(appFee)}
                                  </div>
                                </div>
                                <div className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium flex items-center gap-2 justify-center">
                                  <Eye className="w-4 h-4" />
                                  View Details
                                </div>
                              </div>
                            </div>
                          </Link>
                        )
                      })}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-gray-500">
                        <FileText className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                        <p className="text-sm">
                          No license applications started in {monthNames[selectedMonth - 1]} {selectedYear}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })
        ) : (
          <div className="bg-white rounded-xl p-12 text-center shadow-md border border-gray-100">
            <Building2 className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 text-lg">No agencies found</p>
          </div>
        )}
      </div>
    </div>
  )
}
