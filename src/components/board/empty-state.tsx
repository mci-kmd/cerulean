import { Settings } from "lucide-react";
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
    <div className="flex flex-col items-center justify-center h-[60vh] gap-4 text-center">
      <div className="rounded-full bg-muted p-4">
        <Settings className="h-8 w-8 text-muted-foreground" />
      </div>
      <div>
        <h2 className="text-lg font-semibold">
          {!hasSettings ? "Configure Connection" : "Set Up Columns"}
        </h2>
        <p className="text-sm text-muted-foreground mt-1 max-w-sm">
          {!hasSettings
            ? "Add your Azure DevOps PAT, organization, and project to get started."
            : !hasColumns
              ? "Add board columns to organize your work items."
              : "No work items found matching your criteria."}
        </p>
      </div>
      <Button onClick={onOpenSettings}>
        <Settings className="h-4 w-4 mr-2" />
        Open Settings
      </Button>
    </div>
  );
}
