import { Settings, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  hasSettings: boolean;
  hasColumns: boolean;
  onOpenSettings: () => void;
}

export function EmptyState({
  hasSettings,
  hasColumns,
  onOpenSettings,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center h-[60vh] gap-6 text-center">
      <div className="relative">
        <div className="rounded-full bg-primary/5 p-6">
          <div className="rounded-full bg-primary/10 p-4">
            {!hasSettings ? (
              <Settings className="h-8 w-8 text-primary" />
            ) : (
              <Layers className="h-8 w-8 text-primary" />
            )}
          </div>
        </div>
      </div>
      <div>
        <h2 className="text-lg font-semibold font-heading">
          {!hasSettings ? "Configure Connection" : "Set Up Columns"}
        </h2>
        <p className="text-sm text-muted-foreground mt-1.5 max-w-sm leading-relaxed">
          {!hasSettings
            ? "Add your Azure DevOps PAT, organization, and project to get started."
            : !hasColumns
              ? "Add board columns to organize your work items."
              : "No work items found matching your criteria."}
        </p>
      </div>
      <Button onClick={onOpenSettings} className="bg-primary text-primary-foreground hover:bg-primary/90">
        <Settings className="h-4 w-4 mr-2" />
        Open Settings
      </Button>
    </div>
  );
}
