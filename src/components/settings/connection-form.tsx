import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useAdoConnection } from "@/hooks/use-ado-connection";

interface ConnectionFormProps {
  pat: string;
  org: string;
  project: string;
  team: string;
  githubUsername: string;
  githubRepository: string;
  onChange: (field: string, value: string) => void;
}

export function ConnectionForm({
  pat,
  org,
  project,
  team,
  githubUsername,
  githubRepository,
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
        <Label htmlFor="team">Team</Label>
        <Input
          id="team"
          value={team}
          onChange={(e) => onChange("team", e.target.value)}
          placeholder="my-team"
        />
        <p className="text-xs text-muted-foreground">
          Required for team-board column behavior.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="github-username">GitHub Username</Label>
        <Input
          id="github-username"
          value={githubUsername}
          onChange={(e) => onChange("githubUsername", e.target.value)}
          placeholder="@octocat"
        />
        <p className="text-xs text-muted-foreground">
          Optional. Used to show assigned GitHub PRs from a public repo.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="github-repository">GitHub Repository</Label>
        <Input
          id="github-repository"
          value={githubRepository}
          onChange={(e) => onChange("githubRepository", e.target.value)}
          placeholder="owner/repo"
        />
        <p className="text-xs text-muted-foreground">
          Optional. Public repo only for now.
        </p>
      </div>
      <div className="flex items-center gap-2">
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
        {testConn.isSuccess && (
          <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            Connected
          </span>
        )}
        {testConn.isError && (
          <span className="inline-flex items-center gap-1 text-xs text-red-600">
            <span className="h-2 w-2 rounded-full bg-red-400" />
            Failed
          </span>
        )}
      </div>
    </div>
  );
}
