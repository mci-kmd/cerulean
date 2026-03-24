import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface RetroSettingsInputProps {
  retroRepository: string;
  retroBranch: string;
  retroFolder: string;
  retroFilenamePattern: string;
  onChange: (field: string, value: string) => void;
}

export function RetroSettingsInput({
  retroRepository,
  retroBranch,
  retroFolder,
  retroFilenamePattern,
  onChange,
}: RetroSettingsInputProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">
          Retro Prep reads the newest markdown file from an ADO repo folder, transforms it into a new draft, and can create today&apos;s file back in that repo.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="retroRepository">Retro Repository</Label>
        <Input
          id="retroRepository"
          value={retroRepository}
          onChange={(e) => onChange("retroRepository", e.target.value)}
          placeholder="my-retro-repo"
        />
        <p className="text-xs text-muted-foreground">
          Repository name or id inside the configured Azure DevOps project.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="retroBranch">Retro Branch</Label>
        <Input
          id="retroBranch"
          value={retroBranch}
          onChange={(e) => onChange("retroBranch", e.target.value)}
          placeholder="main"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="retroFolder">Retro Folder</Label>
        <Input
          id="retroFolder"
          value={retroFolder}
          onChange={(e) => onChange("retroFolder", e.target.value)}
          placeholder="retros"
        />
        <p className="text-xs text-muted-foreground">
          Folder path inside the repo. Leave empty to search the repo root.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="retroFilenamePattern">Retro Filename Pattern</Label>
        <Input
          id="retroFilenamePattern"
          value={retroFilenamePattern}
          onChange={(e) => onChange("retroFilenamePattern", e.target.value)}
          placeholder="{date}.md"
        />
        <p className="text-xs text-muted-foreground">
          Supported tokens: <code>{"{date}"}</code>, <code>{"{yyyy}"}</code>, <code>{"{MM}"}</code>, <code>{"{dd}"}</code>.
        </p>
      </div>
    </div>
  );
}
