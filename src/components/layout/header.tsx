import {
  FileText,
  FolderGit2,
  Presentation,
  RefreshCw,
  Rocket,
  Settings,
  SquareKanban,
  Workflow,
} from "lucide-react";
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
  retroMode?: boolean;
  onToggleRetro?: () => void;
  showRetroButton?: boolean;
  onOpenSettings?: () => void;
}

const adoHeaderLinks = [
  {
    label: "Board",
    href: "https://dev.azure.com/kmddk/KMD%20Identity/_boards/board/t/KMD%20Identity%20Team/Stories?System.AssignedTo=%40me%2C_Unassigned_",
    icon: SquareKanban,
  },
  {
    label: "Files",
    href: "https://dev.azure.com/kmddk/KMD%20Identity/_git/KMD.Identity",
    icon: FolderGit2,
  },
  {
    label: "Pipelines",
    href: "https://dev.azure.com/kmddk/KMD%20Identity/_build",
    icon: Workflow,
  },
  {
    label: "Releases",
    href: "https://dev.azure.com/kmddk/KMD%20Identity/_release",
    icon: Rocket,
  },
] as const;

export function Header({
  onRefresh,
  isRefreshing,
  lastUpdated,
  hasError,
  demoMode,
  onToggleDemo,
  showDemoButton,
  retroMode,
  onToggleRetro,
  showRetroButton,
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
    <header className="grid grid-cols-[1fr_auto_1fr] items-center border-b bg-card/80 px-4 py-2 backdrop-blur supports-[backdrop-filter]:bg-card/60">
      <div className="flex min-w-0 items-center gap-2.5">
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

      <nav
        aria-label="Azure DevOps quick links"
        className="flex items-center justify-self-center gap-1"
      >
        {adoHeaderLinks.map(({ label, href, icon: Icon }) => (
          <Tooltip key={label}>
            <TooltipTrigger asChild>
              <Button asChild variant="ghost" size="icon" className="h-8 w-8">
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={label}
                >
                  <Icon className="h-4 w-4" />
                </a>
              </Button>
            </TooltipTrigger>
            <TooltipContent>{label}</TooltipContent>
          </Tooltip>
        ))}
      </nav>

      <div className="flex items-center justify-self-end gap-1">
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

        {showRetroButton && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={retroMode ? "default" : "ghost"}
                size="sm"
                className={`h-8 gap-1.5 ${retroMode ? "bg-primary text-primary-foreground" : ""}`}
                onClick={onToggleRetro}
                aria-label="Retro prep"
              >
                <FileText className="h-4 w-4" />
                <span className="text-xs">{retroMode ? "Exit Retro" : "Retro"}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>{retroMode ? "Exit Retro" : "Retro Prep"}</TooltipContent>
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
