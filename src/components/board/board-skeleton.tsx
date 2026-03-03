import { Skeleton } from "@/components/ui/skeleton";

export function BoardSkeleton({ columnCount = 3 }: { columnCount?: number }) {
  return (
    <div className="flex gap-4 p-4">
      {Array.from({ length: columnCount }).map((_, i) => (
        <div
          key={i}
          className="flex flex-col min-w-[280px] max-w-[320px] bg-muted/30 rounded-lg border-t-2 border-t-border"
        >
          <div className="flex items-center justify-between px-3 py-2.5">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-5 w-6 rounded-md" />
          </div>
          <div className="px-2 pb-2 space-y-2">
            {Array.from({ length: 3 - i }).map((_, j) => (
              <div key={j} className="rounded-lg border-l-[3px] border-l-slate-200 border border-border bg-card p-3 space-y-2">
                <div className="flex items-center gap-1.5">
                  <Skeleton className="h-3.5 w-3.5 rounded-full" />
                  <Skeleton className="h-4 w-16" />
                  <span className="flex-1" />
                  <Skeleton className="h-3 w-8" />
                </div>
                <Skeleton className="h-4 w-full" />
                <div className="flex items-center gap-2">
                  <Skeleton className="h-5 w-5 rounded-full" />
                  <Skeleton className="h-3 w-20" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
