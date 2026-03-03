import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface SourceStateInputProps {
  sourceState: string;
  approvalState: string;
  closedState: string;
  pollInterval: number;
  onChange: (field: string, value: string | number) => void;
}

export function SourceStateInput({
  sourceState,
  approvalState,
  closedState,
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
