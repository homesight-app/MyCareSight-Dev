import LoadingSpinner from '@/components/LoadingSpinner'

export default function Loading() {
  return (
    <div className="fixed top-[90px] left-0 right-0 bottom-0 bg-white/80 backdrop-blur-sm z-[45] flex items-center justify-center">
      <LoadingSpinner fullScreen={false} size="lg" />
    </div>
  )
}
