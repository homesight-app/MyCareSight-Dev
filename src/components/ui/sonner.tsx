'use client'

import { Toaster as SonnerToaster } from 'sonner'
import { CheckCircle2, XCircle, AlertCircle, Info } from 'lucide-react'

export function Toaster() {
  return (
    <SonnerToaster
      position="top-center"
      toastOptions={{ duration: 6000 }}
      icons={{
        success: <CheckCircle2 className="w-4 h-4" />,
        error: <XCircle className="w-4 h-4" />,
        warning: <AlertCircle className="w-4 h-4" />,
        info: <Info className="w-4 h-4" />,
      }}
    />
  )
}
