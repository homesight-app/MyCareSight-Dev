'use client'

import { useState, useRef } from 'react'
import { Upload, RotateCcw, ImageOff } from 'lucide-react'
import Button from '@/components/ui/PrimaryButton'
import { hexDarken, hexLighten } from '@/lib/color-utils'

function applyBrandingVarsLive(primaryColor?: string | null, sidebarColor?: string | null) {
  const root = document.documentElement
  if (primaryColor) {
    root.style.setProperty('--brand', primaryColor)
    root.style.setProperty('--brand-hover', hexDarken(primaryColor))
    root.style.setProperty('--brand-subtle', hexLighten(primaryColor))
  } else {
    root.style.removeProperty('--brand')
    root.style.removeProperty('--brand-hover')
    root.style.removeProperty('--brand-subtle')
  }
  if (sidebarColor) {
    root.style.setProperty('--sidebar-bg', sidebarColor)
  } else {
    root.style.removeProperty('--sidebar-bg')
  }
}

export interface BrandingValues {
  logoUrl?: string | null
  logoIconUrl?: string | null
  primaryColor?: string | null
  sidebarColor?: string | null
}

interface BrandingFormProps {
  currentValues: BrandingValues
  onSaveLogo: (file: File, variant: 'full' | 'icon') => Promise<{ url?: string | null; error?: string | null }>
  onSaveColors: (primaryColor: string, sidebarColor: string) => Promise<{ error?: string | null }>
  onReset: () => Promise<{ error?: string | null }>
  resetLabel?: string
}

const MAX_SIZE = 5 * 1024 * 1024

function LogoUploadZone({
  label,
  hint,
  currentUrl,
  onUpload,
}: {
  label: string
  hint: string
  currentUrl?: string | null
  onUpload: (file: File) => Promise<void>
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentUrl ?? null)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleFileChange = async (file: File) => {
    setError(null)
    if (!file.type.startsWith('image/')) { setError('Please select an image file.'); return }
    if (file.size > MAX_SIZE) { setError('File must be under 5MB.'); return }
    const localUrl = URL.createObjectURL(file)
    setPreviewUrl(localUrl)
    setIsUploading(true)
    await onUpload(file)
    setIsUploading(false)
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-gray-700">{label}</p>
      <p className="text-xs text-gray-400">{hint}</p>
      <div
        className="border-2 border-dashed border-gray-200 rounded-lg p-4 flex items-center gap-4 cursor-pointer hover:border-brand hover:bg-gray-50 transition-colors"
        onClick={() => inputRef.current?.click()}
      >
        <div className="w-24 h-12 flex-shrink-0 bg-gray-100 rounded flex items-center justify-center overflow-hidden">
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewUrl} alt={label} className="max-w-full max-h-full object-contain" />
          ) : (
            <ImageOff className="w-6 h-6 text-gray-300" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-gray-600">
            {isUploading ? 'Uploading…' : previewUrl ? 'Click to replace' : 'Click to upload'}
          </p>
          {error && <p className="text-xs text-red-500 mt-0.5">{error}</p>}
        </div>
        <Button variant="secondary" size="sm" icon={Upload} type="button" disabled={isUploading}>
          {isUploading ? 'Uploading…' : 'Upload'}
        </Button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFileChange(f) }}
      />
    </div>
  )
}

function HexColorInput({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-gray-700">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-9 h-9 p-0.5 border border-gray-200 rounded cursor-pointer bg-white"
          title={label}
        />
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="#000000"
          maxLength={7}
          className="w-28 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand focus:border-transparent font-mono uppercase"
        />
      </div>
    </div>
  )
}

export default function BrandingForm({
  currentValues,
  onSaveLogo,
  onSaveColors,
  onReset,
  resetLabel = 'Reset to Defaults',
}: BrandingFormProps) {
  const [primaryColor, setPrimaryColor] = useState(currentValues.primaryColor ?? '#4F66E8')
  const [sidebarColor, setSidebarColor] = useState(currentValues.sidebarColor ?? '#0F172A')
  const [logoUrl, setLogoUrl] = useState(currentValues.logoUrl ?? null)
  const [logoIconUrl, setLogoIconUrl] = useState(currentValues.logoIconUrl ?? null)
  const [isSavingColors, setIsSavingColors] = useState(false)
  const [isResetting, setIsResetting] = useState(false)
  const [colorError, setColorError] = useState<string | null>(null)
  const [colorSuccess, setColorSuccess] = useState(false)
  const [resetError, setResetError] = useState<string | null>(null)

  const handleSaveLogo = async (file: File, variant: 'full' | 'icon') => {
    const result = await onSaveLogo(file, variant)
    if (result.url) {
      if (variant === 'full') setLogoUrl(result.url)
      else setLogoIconUrl(result.url)
    }
  }

  const handleSaveColors = async () => {
    setIsSavingColors(true)
    setColorError(null)
    setColorSuccess(false)
    const result = await onSaveColors(primaryColor, sidebarColor)
    setIsSavingColors(false)
    if (result.error) { setColorError(result.error) }
    else {
      applyBrandingVarsLive(primaryColor, sidebarColor)
      setColorSuccess(true)
      setTimeout(() => setColorSuccess(false), 3000)
    }
  }

  const handleReset = async () => {
    setIsResetting(true)
    setResetError(null)
    const result = await onReset()
    setIsResetting(false)
    if (result.error) { setResetError(result.error) }
    else {
      const defaultPrimary = '#4F66E8'
      const defaultSidebar = '#0F172A'
      setLogoUrl(null)
      setLogoIconUrl(null)
      setPrimaryColor(defaultPrimary)
      setSidebarColor(defaultSidebar)
      applyBrandingVarsLive(defaultPrimary, defaultSidebar)
    }
  }

  return (
    <div className="space-y-8">
      {/* Logos */}
      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 mb-1">Logo</h3>
          <p className="text-xs text-gray-400">Displayed in the sidebar when expanded.</p>
        </div>
        <LogoUploadZone
          label="Full Logo"
          hint="Recommended: 300 × 80 px · PNG or SVG with transparent background"
          currentUrl={logoUrl}
          onUpload={f => handleSaveLogo(f, 'full')}
        />
        <LogoUploadZone
          label="Icon Logo"
          hint="Recommended: 80 × 80 px · Displayed when sidebar is collapsed"
          currentUrl={logoIconUrl}
          onUpload={f => handleSaveLogo(f, 'icon')}
        />
      </div>

      {/* Colors */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-gray-900">Colors</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <HexColorInput
            label="Primary Brand Color"
            value={primaryColor}
            onChange={setPrimaryColor}
          />
          <HexColorInput
            label="Sidebar Background"
            value={sidebarColor}
            onChange={setSidebarColor}
          />
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="primary"
            type="button"
            onClick={handleSaveColors}
            loading={isSavingColors}
          >
            Save Colors
          </Button>
          {colorSuccess && <span className="text-sm text-green-600 font-medium">Saved.</span>}
          {colorError && <span className="text-sm text-red-600">{colorError}</span>}
        </div>
      </div>

      {/* Reset */}
      <div className="pt-4 border-t border-gray-100">
        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            type="button"
            icon={RotateCcw}
            onClick={handleReset}
            loading={isResetting}
          >
            {resetLabel}
          </Button>
          {resetError && <span className="text-sm text-red-600">{resetError}</span>}
        </div>
        <p className="text-xs text-gray-400 mt-2">Removes uploaded logos and restores the default colors.</p>
      </div>
    </div>
  )
}
