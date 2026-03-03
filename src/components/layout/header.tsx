import { useState } from "react";
import { Settings, RefreshCw, Presentation } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { SettingsDialog } from "@/components/settings/settings-dialog";

interface HeaderProps {
  onRefresh?: () => void;
  isRefreshing?: boolean;
  lastUpdated?: number;
  demoMode?: boolean;
  onToggleDemo?: () => void;
  showDemoButton?: boolean;
}

export function Header({
  onRefresh,
  isRefreshing,
  lastUpdated,
  demoMode,
  onToggleDemo,
  showDemoButton,
}: HeaderProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);

  const formatTime = (ts?: number) => {
    if (!ts) return "";
    return new Date(ts).toLocaleTimeString();
  };

  return (
    <>
      <header className="flex items-center justify-between px-4 py-2 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <h1 className="text-lg font-semibold tracking-tight">Cerulean</h1>

        <div className="flex items-center gap-2">
          {lastUpdated ? (
            <span className="text-xs text-muted-foreground">
              {formatTime(lastUpdated)}
            </span>
          ) : null}

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

          {showDemoButton && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={demoMode ? "default" : "ghost"}
                  size="icon"
                  className="h-8 w-8"
                  onClick={onToggleDemo}
                  aria-label="Demo mode"
                >
                  <Presentation className="h-4 w-4" />
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
                onClick={() => setSettingsOpen(true)}
              >
                <Settings className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Settings</TooltipContent>
          </Tooltip>
        </div>
      </header>

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </>
  );
}
