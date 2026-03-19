import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface SourceStateInputProps {
  sourceBoardColumn: string;
  candidateBoardColumn: string;
  approvalBoardColumn: string;
  closedState: string;
  areaPath: string;
  workItemTypes: string;
  pollInterval: number;
  onChange: (field: string, value: string | number) => void;
}

export function SourceStateInput({
  sourceBoardColumn,
  candidateBoardColumn,
  approvalBoardColumn,
  closedState,
  areaPath,
  workItemTypes,
  pollInterval,
  onChange,
}: SourceStateInputProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">
          Current-work items are loaded from one configured source-board column. Your local columns are Cerulean-only.
        </p>
        <p className="text-xs text-muted-foreground">
          New Work can come from a configured source-board column. Leave it empty to use the source board&apos;s incoming column.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="sourceBoardColumn">Active Work Board Column</Label>
        <Input
          id="sourceBoardColumn"
          value={sourceBoardColumn}
          onChange={(e) => onChange("sourceBoardColumn", e.target.value)}
          placeholder="Approved"
        />
        <p className="text-xs text-muted-foreground">
          Required source-board column for all current-work items.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="candidateBoardColumn">New Work Board Column</Label>
        <Input
          id="candidateBoardColumn"
          value={candidateBoardColumn}
          onChange={(e) => onChange("candidateBoardColumn", e.target.value)}
          placeholder="New"
        />
        <p className="text-xs text-muted-foreground">
          Optional. Overrides the source-board incoming column used for New Work candidates.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="approvalBoardColumn">Approval Board Column</Label>
        <Input
          id="approvalBoardColumn"
          value={approvalBoardColumn}
          onChange={(e) => onChange("approvalBoardColumn", e.target.value)}
          placeholder="Approved"
        />
        <p className="text-xs text-muted-foreground">
          Optional source-board column to mirror into Completed.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="closedState">Closed State</Label>
        <Input
          id="closedState"
          value={closedState}
          onChange={(e) => onChange("closedState", e.target.value)}
          placeholder="Closed"
        />
        <p className="text-xs text-muted-foreground">
          Used only by demo approval actions.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="areaPath">Area Path</Label>
        <Input
          id="areaPath"
          value={areaPath}
          onChange={(e) => onChange("areaPath", e.target.value)}
          placeholder="Project\Team"
        />
        <p className="text-xs text-muted-foreground">
          Filter work items to this area path and below. Leave empty for all areas.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="workItemTypes">Work Item Types</Label>
        <Input
          id="workItemTypes"
          value={workItemTypes}
          onChange={(e) => onChange("workItemTypes", e.target.value)}
          placeholder="Bug, User Story"
        />
        <p className="text-xs text-muted-foreground">
          Comma-separated types to include (e.g. Bug, Task, User Story). Leave empty for all types.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="pollInterval">Poll Interval (seconds)</Label>
        <Input
          id="pollInterval"
          type="number"
          min={5}
          max={300}
          value={pollInterval}
          onChange={(e) =>
            onChange("pollInterval", parseInt(e.target.value, 10) || 30)
          }
        />
      </div>
    </div>
  );
}
