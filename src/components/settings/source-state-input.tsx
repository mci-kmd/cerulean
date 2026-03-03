import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface SourceStateInputProps {
  sourceState: string;
  approvalState: string;
  closedState: string;
  candidateState: string;
  areaPath: string;
  workItemTypes: string;
  pollInterval: number;
  onChange: (field: string, value: string | number) => void;
}

export function SourceStateInput({
  sourceState,
  approvalState,
  closedState,
  candidateState,
  areaPath,
  workItemTypes,
  pollInterval,
  onChange,
}: SourceStateInputProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="sourceState">Source State</Label>
        <Input
          id="sourceState"
          value={sourceState}
          onChange={(e) => onChange("sourceState", e.target.value)}
          placeholder="Active"
        />
        <p className="text-xs text-muted-foreground">
          ADO work item state to pull from (e.g. Active, New, In Progress)
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="approvalState">Approval State</Label>
        <Input
          id="approvalState"
          value={approvalState}
          onChange={(e) => onChange("approvalState", e.target.value)}
          placeholder="Resolved"
        />
        <p className="text-xs text-muted-foreground">
          State for items pending approval in demo mode (e.g. Resolved)
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
          State to set when approving items in demo mode (e.g. Closed)
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="candidateState">Candidate State</Label>
        <Input
          id="candidateState"
          value={candidateState}
          onChange={(e) => onChange("candidateState", e.target.value)}
          placeholder="New"
        />
        <p className="text-xs text-muted-foreground">
          State for unassigned items in the candidate tray (e.g. New, Proposed). Leave empty to disable.
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
