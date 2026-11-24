'use client'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { Building, Clock, FileText } from 'lucide-react'
import { toast } from 'sonner'
import Button from '@/components/ui/PrimaryButton'
import { companyDetailsSchema, type CompanyDetailsFormInput, type CompanyDetailsFormOutput } from '@/lib/schemas/profile'
import { saveAgencyInfoAction } from '@/app/actions/agency-branches'

interface InitialAgency {
  name?: string | null
  business_type?: string | null
  tax_id?: string | null
  primary_license_number?: string | null
  website?: string | null
  physical_street_address?: string | null
  physical_city?: string | null
  physical_state?: string | null
  physical_zip_code?: string | null
  same_as_physical?: boolean | null
  mailing_street_address?: string | null
  mailing_city?: string | null
  mailing_state?: string | null
  mailing_zip_code?: string | null
}


const emptyCompanyDefaults = {
  companyName: '',
  businessType: '',
  taxId: '',
  primaryLicenseNumber: '',
  website: '',
  physicalStreetAddress: '',
  physicalCity: '',
  physicalState: '',
  physicalZipCode: '',
  sameAsPhysical: true,
  mailingStreetAddress: '',
  mailingCity: '',
  mailingState: '',
  mailingZipCode: '',
}


export default function AgencyInfoSection({ initialAgency }: { initialAgency: InitialAgency }) {
 const router = useRouter()
 const [isLoading, setIsLoading] = useState(false)
 const [isEditingCompany, setIsEditingCompany] = useState(true)
  const {
    register: registerCompany,
    handleSubmit: handleSubmitCompany,
    formState: { errors: companyErrors },
    watch: watchCompany,
    setValue: setCompanyValue,
    setError: setCompanyError,
  } = useForm<CompanyDetailsFormInput, any, CompanyDetailsFormOutput>({
    resolver: zodResolver(companyDetailsSchema),
    mode: 'onBlur',
    defaultValues: initialAgency
      ? {
          companyName: initialAgency.name ?? '',
          businessType: initialAgency.business_type ?? '',
          taxId: initialAgency.tax_id ?? '',
          primaryLicenseNumber: initialAgency.primary_license_number ?? '',
          website: initialAgency.website ?? '',
          physicalStreetAddress: initialAgency.physical_street_address ?? '',
          physicalCity: initialAgency.physical_city ?? '',
          physicalState: initialAgency.physical_state ?? '',
          physicalZipCode: initialAgency.physical_zip_code ?? '',
          sameAsPhysical: initialAgency.same_as_physical ?? true,
          mailingStreetAddress: initialAgency.mailing_street_address ?? '',
          mailingCity: initialAgency.mailing_city ?? '',
          mailingState: initialAgency.mailing_state ?? '',
          mailingZipCode: initialAgency.mailing_zip_code ?? '',
        }
      : emptyCompanyDefaults,
  })

  const sameAsPhysical = watchCompany('sameAsPhysical')

  const onCompanySubmit = async (data: CompanyDetailsFormOutput) => {
    setIsLoading(true)

    try {
      const result = await saveAgencyInfoAction({
        companyName: data.companyName,
        businessType: data.businessType,
        taxId: data.taxId,
        primaryLicenseNumber: data.primaryLicenseNumber,
        website: data.website || undefined,
        physicalStreetAddress: data.physicalStreetAddress,
        physicalCity: data.physicalCity,
        physicalState: data.physicalState,
        physicalZipCode: data.physicalZipCode,
        sameAsPhysical: data.sameAsPhysical,
        mailingStreetAddress: data.mailingStreetAddress,
        mailingCity: data.mailingCity,
        mailingState: data.mailingState,
        mailingZipCode: data.mailingZipCode,
      })

      if (!result.success) {
        if ('fieldErrors' in result && result.fieldErrors) {
          for (const [field, messages] of Object.entries(result.fieldErrors)) setCompanyError(field as keyof CompanyDetailsFormInput, { message: messages[0] })
        }
        toast.error(result.error)
        setIsLoading(false)
        return
      }

      toast.success('Agency information saved')
      setIsEditingCompany(false)
      router.refresh()


    } catch {
      toast.error('Unable to save agency information. Refresh before retrying.')
    } finally {
      setIsLoading(false)
    }
  }


return (
          <div className="space-y-6">
            {/* Page Header */}
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-2">
                <FileText className="w-6 h-6 text-gray-600" />
                <h2 className="text-xl font-bold text-gray-900">Agency Info</h2>
              </div>
              <p className="text-gray-600 text-sm">Update your agency information and business details. Manage office addresses under Branches; changes here do not update branch addresses.</p>
            </div>



            {/* Company Overview Card */}
            <div className="bg-white border border-gray-200 rounded-xl p-6 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-blue-500 rounded-lg flex items-center justify-center">
                  <Building className="w-8 h-8 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">{watchCompany('companyName') || 'Agency name'}</h3>
                  <p className="text-sm text-gray-600">{watchCompany('businessType') || 'Business type'}</p>
                  <p className="text-sm text-gray-600">License: {watchCompany('primaryLicenseNumber') || '—'}</p>
                </div>
              </div>
              <button
                onClick={() => setIsEditingCompany(!isEditingCompany)}
                className="px-4 py-2 bg-gray-100 text-gray-700 font-medium rounded-lg hover:bg-gray-200 transition-colors flex items-center gap-2"
              >
                <Clock className="w-4 h-4" />
                {isEditingCompany ? 'View Details' : 'Edit Details'}
              </button>
            </div>

            {/* Agency Info Form */}
            {isEditingCompany && (
              <form noValidate onSubmit={handleSubmitCompany(onCompanySubmit)} className="space-y-8">
                <fieldset disabled={isLoading} className="space-y-8">
                {/* Basic Information Section */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-6">Basic Information</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label htmlFor="agency-companyName" className="block text-sm font-semibold text-gray-700 mb-2">
                        Agency Name <span className="text-red-600">*</span>
                      </label>
                      <input id="agency-companyName" {...registerCompany('companyName')} aria-invalid={!!companyErrors.companyName} aria-describedby={companyErrors.companyName ? 'agency-companyName-error' : undefined}
                        className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none bg-gray-50"
                      />
                      {companyErrors.companyName && (
                        <p id="agency-companyName-error" className="mt-1 text-sm text-red-600">{companyErrors.companyName.message}</p>
                      )}
                    </div>

                    <div>
                      <label htmlFor="agency-businessType" className="block text-sm font-semibold text-gray-700 mb-2">
                        Business Type <span className="text-red-600">*</span>
                      </label>
                      <input id="agency-businessType" {...registerCompany('businessType')} aria-invalid={!!companyErrors.businessType} aria-describedby={companyErrors.businessType ? 'agency-businessType-error' : undefined}
                        className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none bg-gray-50"
                      />
                      {companyErrors.businessType && (
                        <p id="agency-businessType-error" className="mt-1 text-sm text-red-600">{companyErrors.businessType.message}</p>
                      )}
                    </div>

                    <div>
                      <label htmlFor="agency-taxId" className="block text-sm font-semibold text-gray-700 mb-2">
                        Tax ID / EIN <span className="text-red-600">*</span>
                      </label>
                      <input id="agency-taxId" {...registerCompany('taxId')} aria-invalid={!!companyErrors.taxId} aria-describedby={companyErrors.taxId ? 'agency-taxId-error' : undefined}
                        className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none bg-gray-50"
                      />
                      {companyErrors.taxId && (
                        <p id="agency-taxId-error" className="mt-1 text-sm text-red-600">{companyErrors.taxId.message}</p>
                      )}
                    </div>

                    <div>
                      <label htmlFor="agency-primaryLicenseNumber" className="block text-sm font-semibold text-gray-700 mb-2">
                        Primary License Number <span className="text-red-600">*</span>
                      </label>
                      <input id="agency-primaryLicenseNumber" {...registerCompany('primaryLicenseNumber')} aria-invalid={!!companyErrors.primaryLicenseNumber} aria-describedby={companyErrors.primaryLicenseNumber ? 'agency-primaryLicenseNumber-error' : undefined}
                        className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none bg-gray-50"
                      />
                      {companyErrors.primaryLicenseNumber && (
                        <p id="agency-primaryLicenseNumber-error" className="mt-1 text-sm text-red-600">{companyErrors.primaryLicenseNumber.message}</p>
                      )}
                    </div>

                    <div className="md:col-span-2">
                      <label htmlFor="agency-website" className="block text-sm font-semibold text-gray-700 mb-2">
                        Website
                      </label>
                      <input id="agency-website" type="url"
                        {...registerCompany('website')} aria-invalid={!!companyErrors.website} aria-describedby={companyErrors.website ? 'agency-website-error' : undefined}
                        className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none bg-gray-50"
                      />
                      {companyErrors.website && (
                        <p id="agency-website-error" className="mt-1 text-sm text-red-600">{companyErrors.website.message}</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Physical Address Section */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-6">Physical Address</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="md:col-span-2">
                      <label htmlFor="agency-physicalStreetAddress" className="block text-sm font-semibold text-gray-700 mb-2">
                        Street Address <span className="text-red-600">*</span>
                      </label>
                      <input id="agency-physicalStreetAddress" {...registerCompany('physicalStreetAddress')} aria-invalid={!!companyErrors.physicalStreetAddress} aria-describedby={companyErrors.physicalStreetAddress ? 'agency-physicalStreetAddress-error' : undefined}
                        className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none bg-gray-50"
                      />
                      {companyErrors.physicalStreetAddress && (
                        <p id="agency-physicalStreetAddress-error" className="mt-1 text-sm text-red-600">{companyErrors.physicalStreetAddress.message}</p>
                      )}
                    </div>

                    <div>
                      <label htmlFor="agency-physicalCity" className="block text-sm font-semibold text-gray-700 mb-2">
                        City <span className="text-red-600">*</span>
                      </label>
                      <input id="agency-physicalCity" {...registerCompany('physicalCity')} aria-invalid={!!companyErrors.physicalCity} aria-describedby={companyErrors.physicalCity ? 'agency-physicalCity-error' : undefined}
                        className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none bg-gray-50"
                      />
                      {companyErrors.physicalCity && (
                        <p id="agency-physicalCity-error" className="mt-1 text-sm text-red-600">{companyErrors.physicalCity.message}</p>
                      )}
                    </div>

                    <div>
                      <label htmlFor="agency-physicalState" className="block text-sm font-semibold text-gray-700 mb-2">
                        State <span className="text-red-600">*</span>
                      </label>
                      <input id="agency-physicalState" {...registerCompany('physicalState')} aria-invalid={!!companyErrors.physicalState} aria-describedby={companyErrors.physicalState ? 'agency-physicalState-error' : undefined}
                        className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none bg-gray-50"
                      />
                      {companyErrors.physicalState && (
                        <p id="agency-physicalState-error" className="mt-1 text-sm text-red-600">{companyErrors.physicalState.message}</p>
                      )}
                    </div>

                    <div>
                      <label htmlFor="agency-physicalZipCode" className="block text-sm font-semibold text-gray-700 mb-2">
                        ZIP Code <span className="text-red-600">*</span>
                      </label>
                      <input id="agency-physicalZipCode" {...registerCompany('physicalZipCode')} aria-invalid={!!companyErrors.physicalZipCode} aria-describedby={companyErrors.physicalZipCode ? 'agency-physicalZipCode-error' : undefined}
                        className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none bg-gray-50"
                      />
                      {companyErrors.physicalZipCode && (
                        <p id="agency-physicalZipCode-error" className="mt-1 text-sm text-red-600">{companyErrors.physicalZipCode.message}</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Mailing Address Section */}
                <div>
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-lg font-semibold text-gray-900">Mailing Address</h3>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        {...registerCompany('sameAsPhysical')}
                        checked={sameAsPhysical}
                        onChange={(e) => {
                          setCompanyValue('sameAsPhysical', e.target.checked)
                          if (e.target.checked) {
                            setCompanyValue('mailingStreetAddress', '')
                            setCompanyValue('mailingCity', '')
                            setCompanyValue('mailingState', '')
                            setCompanyValue('mailingZipCode', '')
                          }
                        }}
                        className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                      <span className="text-sm font-medium text-gray-700">Same as physical address</span>
                    </label>
                  </div>

                  {!sameAsPhysical && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="md:col-span-2">
                        <label htmlFor="agency-mailingStreetAddress" className="block text-sm font-semibold text-gray-700 mb-2">
                          Street Address <span className="text-red-600">*</span>
                        </label>
                      <input id="agency-mailingStreetAddress" {...registerCompany('mailingStreetAddress')} aria-invalid={!!companyErrors.mailingStreetAddress} aria-describedby={companyErrors.mailingStreetAddress ? 'agency-mailingStreetAddress-error' : undefined}
                          className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none bg-gray-50"
                        />
                        {companyErrors.mailingStreetAddress && (
                          <p id="agency-mailingStreetAddress-error" className="mt-1 text-sm text-red-600">{companyErrors.mailingStreetAddress.message}</p>
                        )}
                      </div>

                      <div>
                        <label htmlFor="agency-mailingCity" className="block text-sm font-semibold text-gray-700 mb-2">
                          City <span className="text-red-600">*</span>
                        </label>
                      <input id="agency-mailingCity" {...registerCompany('mailingCity')} aria-invalid={!!companyErrors.mailingCity} aria-describedby={companyErrors.mailingCity ? 'agency-mailingCity-error' : undefined}
                          className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none bg-gray-50"
                        />
                        {companyErrors.mailingCity && (
                          <p id="agency-mailingCity-error" className="mt-1 text-sm text-red-600">{companyErrors.mailingCity.message}</p>
                        )}
                      </div>

                      <div>
                        <label htmlFor="agency-mailingState" className="block text-sm font-semibold text-gray-700 mb-2">
                          State <span className="text-red-600">*</span>
                        </label>
                      <input id="agency-mailingState" {...registerCompany('mailingState')} aria-invalid={!!companyErrors.mailingState} aria-describedby={companyErrors.mailingState ? 'agency-mailingState-error' : undefined}
                          className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none bg-gray-50"
                        />
                        {companyErrors.mailingState && (
                          <p id="agency-mailingState-error" className="mt-1 text-sm text-red-600">{companyErrors.mailingState.message}</p>
                        )}
                      </div>

                      <div>
                        <label htmlFor="agency-mailingZipCode" className="block text-sm font-semibold text-gray-700 mb-2">
                          ZIP Code <span className="text-red-600">*</span>
                        </label>
                      <input id="agency-mailingZipCode" {...registerCompany('mailingZipCode')} aria-invalid={!!companyErrors.mailingZipCode} aria-describedby={companyErrors.mailingZipCode ? 'agency-mailingZipCode-error' : undefined}
                          className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none bg-gray-50"
                        />
                        {companyErrors.mailingZipCode && (
                          <p id="agency-mailingZipCode-error" className="mt-1 text-sm text-red-600">{companyErrors.mailingZipCode.message}</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Submit Button */}
                <div className="flex justify-end pt-4 border-t border-gray-200">
                  <Button type="submit" loading={isLoading}>Save Changes</Button>
                </div>
                </fieldset>
              </form>
            )}
          </div>
)
}
