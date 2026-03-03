import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useAdoConnection } from "@/hooks/use-ado-connection";

interface ConnectionFormProps {
  pat: string;
  org: string;
  project: string;
  team: string;
  onChange: (field: string, value: string) => void;
}

export function ConnectionForm({
  pat,
  org,
  project,
  team,
  onChange,
}: ConnectionFormProps) {
  const testConn = useAdoConnection();

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="pat">Personal Access Token</Label>
        <Input
          id="pat"
          type="password"
          value={pat}
          onChange={(e) => onChange("pat", e.target.value)}
          placeholder="Enter your ADO PAT"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="org">Organization</Label>
        <Input
          id="org"
          value={org}
          onChange={(e) => onChange("org", e.target.value)}
          placeholder="my-org"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="project">Project</Label>
        <Input
          id="project"
          value={project}
          onChange={(e) => onChange("project", e.target.value)}
          placeholder="my-project"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="team">Team (optional)</Label>
        <Input
          id="team"
          value={team}
          onChange={(e) => onChange("team", e.target.value)}
          placeholder="my-team"
        />
      </div>
      <Button
        variant="outline"
        size="sm"
        disabled={!pat || !org || !project || testConn.isPending}
        onClick={() => testConn.mutate({ pat, org, project })}
      >
        {testConn.isPending
          ? "Testing..."
          : testConn.isSuccess
            ? "Connected!"
            : testConn.isError
              ? "Failed - Retry"
              : "Test Connection"}
      </Button>
    </div>
  );
}
