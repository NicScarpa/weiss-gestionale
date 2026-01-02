import { Card, CardContent, CardHeader } from '@/components/ui/card'

export function ClosureListSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Header skeleton */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="h-8 w-48 bg-muted rounded" />
          <div className="h-4 w-64 bg-muted rounded mt-2" />
        </div>
        <div className="h-10 w-36 bg-muted rounded" />
      </div>

      {/* Filters skeleton */}
      <Card>
        <CardHeader className="pb-3">
          <div className="h-5 w-16 bg-muted rounded" />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-10 bg-muted rounded" />
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Table skeleton */}
      <Card>
        <CardHeader>
          <div className="h-6 w-40 bg-muted rounded" />
          <div className="h-4 w-32 bg-muted rounded mt-1" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {/* Header row */}
            <div className="grid grid-cols-6 gap-4 pb-3 border-b">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="h-4 bg-muted rounded" />
              ))}
            </div>
            {/* Data rows */}
            {[1, 2, 3, 4, 5].map((row) => (
              <div key={row} className="grid grid-cols-6 gap-4 py-3">
                {[1, 2, 3, 4, 5, 6].map((col) => (
                  <div key={col} className="h-4 bg-muted rounded" />
                ))}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
