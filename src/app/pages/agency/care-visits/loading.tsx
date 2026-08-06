import LoadingSpinner from '@/components/LoadingSpinner'

export default function Loading() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <LoadingSpinner fullScreen={false} size="lg" />
    </div>
  )
}
