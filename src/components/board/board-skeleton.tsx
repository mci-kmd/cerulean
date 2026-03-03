import { Skeleton } from "@/components/ui/skeleton";

export function BoardSkeleton({ columnCount = 3 }: { columnCount?: number }) {
  return (
    <div className="flex gap-4 p-4">
      {Array.from({ length: columnCount }).map((_, i) => (
        <div
          key={i}
          className="flex flex-col min-w-[280px] max-w-[320px] bg-muted/50 rounded-lg"
        >
          <div className="flex items-center justify-between px-3 py-2 border-b">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-4" />
          </div>
          <div className="p-2 space-y-2">
            {Array.from({ length: 3 - i }).map((_, j) => (
              <div key={j} className="rounded-md border bg-card p-3 space-y-2">
                <div className="flex justify-between">
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-3 w-8" />
                </div>
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
