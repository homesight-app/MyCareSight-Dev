export default function Loading() {
  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* Sidebar skeleton */}
      <div className="hidden md:flex flex-col w-64 bg-white border-r border-gray-200 shrink-0">
        {/* Logo */}
        <div className="h-16 flex items-center px-6 border-b border-gray-200">
          <div className="h-8 w-36 bg-gray-200 rounded animate-pulse" />
        </div>
        {/* Nav items */}
        <div className="flex-1 px-4 py-4 space-y-1">
          {Array.from({ length: 11 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-3 py-2 rounded-lg">
              <div className="w-5 h-5 bg-gray-200 rounded animate-pulse" />
              <div className="h-4 bg-gray-200 rounded animate-pulse" style={{ width: `${50 + (i % 4) * 15}%` }} />
            </div>
          ))}
        </div>
        {/* User area */}
        <div className="px-4 py-4 border-t border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gray-200 rounded-full animate-pulse" />
            <div className="flex-1 space-y-1">
              <div className="h-3 w-24 bg-gray-200 rounded animate-pulse" />
              <div className="h-3 w-16 bg-gray-200 rounded animate-pulse" />
            </div>
          </div>
        </div>
      </div>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header skeleton */}
        <div className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 shrink-0">
          <div className="h-5 w-32 bg-gray-200 rounded animate-pulse" />
          <div className="flex items-center gap-4">
            <div className="w-8 h-8 bg-gray-200 rounded-full animate-pulse" />
            <div className="w-8 h-8 bg-gray-200 rounded-full animate-pulse" />
          </div>
        </div>

        {/* Content skeleton */}
        <div className="flex-1 overflow-auto p-6 space-y-6">
          {/* Page title */}
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <div className="h-7 w-56 bg-gray-200 rounded animate-pulse" />
              <div className="h-4 w-48 bg-gray-200 rounded animate-pulse" />
            </div>
            <div className="h-10 w-36 bg-gray-200 rounded-lg animate-pulse" />
          </div>
          {/* Cards */}
          <div className="grid grid-cols-3 gap-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="bg-white rounded-lg p-6 border border-gray-200">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-gray-200 rounded-lg animate-pulse" />
                  <div className="space-y-2">
                    <div className="h-7 w-8 bg-gray-200 rounded animate-pulse" />
                    <div className="h-4 w-24 bg-gray-200 rounded animate-pulse" />
                  </div>
                </div>
              </div>
            ))}
          </div>
          {/* Search bar */}
          <div className="bg-white rounded-lg p-4 border border-gray-200">
            <div className="h-10 bg-gray-200 rounded-lg animate-pulse" />
          </div>
          {/* Table */}
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="h-12 bg-gray-50 border-b border-gray-200 px-6 flex items-center gap-6">
              {[80, 60, 80, 100, 120, 120, 120, 60, 80].map((w, i) => (
                <div key={i} className="h-3 bg-gray-200 rounded animate-pulse" style={{ width: w }} />
              ))}
            </div>
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-16 border-b border-gray-100 px-6 flex items-center gap-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gray-200 rounded-full animate-pulse shrink-0" />
                  <div className="space-y-1">
                    <div className="h-4 w-28 bg-gray-200 rounded animate-pulse" />
                    <div className="h-3 w-16 bg-gray-200 rounded animate-pulse" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
