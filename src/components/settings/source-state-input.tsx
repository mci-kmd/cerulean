import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface SourceStateInputProps {
  sourceState: string;
  pollInterval: number;
  onChange: (field: string, value: string | number) => void;
}

export function SourceStateInput({
  sourceState,
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
