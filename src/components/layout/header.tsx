import { Settings, RefreshCw, Presentation } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatRelativeTime } from "@/lib/format-time";

interface HeaderProps {
  onRefresh?: () => void;
  isRefreshing?: boolean;
  lastUpdated?: number;
  hasError?: boolean;
  demoMode?: boolean;
  onToggleDemo?: () => void;
  showDemoButton?: boolean;
  onOpenSettings?: () => void;
}

export function Header({
  onRefresh,
  isRefreshing,
  lastUpdated,
  hasError,
  demoMode,
  onToggleDemo,
  showDemoButton,
  onOpenSettings,
}: HeaderProps) {
  const statusColor = hasError
    ? "bg-red-400"
    : isRefreshing
      ? "bg-amber-400"
      : lastUpdated
        ? "bg-emerald-400"
        : "bg-slate-300";

  return (
    <header className="flex items-center justify-between px-4 py-2 border-b bg-card/80 backdrop-blur supports-[backdrop-filter]:bg-card/60">
      <div className="flex items-center gap-2.5">
        <h1 className="text-lg font-semibold tracking-tight font-heading">
          Cerulean<span className="text-primary">.</span>
        </h1>
        {(lastUpdated || hasError) && (
          <span className={`inline-block h-2 w-2 rounded-full ${statusColor}`} />
        )}
        {lastUpdated ? (
          <span className="text-xs text-muted-foreground font-mono">
            {formatRelativeTime(lastUpdated)}
          </span>
        ) : null}
      </div>

      <div className="flex items-center gap-1">
        {onRefresh && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={onRefresh}
                disabled={isRefreshing}
              >
                <RefreshCw
                  className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`}
                />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Refresh</TooltipContent>
          </Tooltip>
        )}

        {showDemoButton && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={demoMode ? "default" : "ghost"}
                size="sm"
                className={`h-8 gap-1.5 ${demoMode ? "bg-primary text-primary-foreground" : ""}`}
                onClick={onToggleDemo}
                aria-label="Demo mode"
              >
                <Presentation className="h-4 w-4" />
                <span className="text-xs">{demoMode ? "Exit Demo" : "Demo"}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {demoMode ? "Exit Demo" : "Demo Mode"}
            </TooltipContent>
          </Tooltip>
        )}

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={onOpenSettings}
            >
              <Settings className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Settings</TooltipContent>
        </Tooltip>
      </div>
    </header>
  );
}
