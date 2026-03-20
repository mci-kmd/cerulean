import type { AdoClient } from "@/api/ado-client";

const REF_HEADS_PREFIX = "refs/heads/";

export interface AdoPullRequestCreateCandidate {
  repositoryId: string;
  repositoryName: string;
  sourceRefName: string;
  sourceBranchName: string;
  targetRefName: string;
  targetBranchName: string;
  url: string;
}

interface FindAdoPullRequestCreateCandidatesOptions {
  client: AdoClient;
  org: string;
  project: string;
  workItemId: number;
}

interface OpenAdoPullRequestCreateOptions extends FindAdoPullRequestCreateCandidatesOptions {
  clipboard: Pick<Clipboard, "writeText">;
  prompt: (message?: string, defaultValue?: string) => string | null;
  open: (url?: string | URL, target?: string, features?: string) => Window | null;
}

export function getShortBranchName(refName: string): string {
  return refName.startsWith(REF_HEADS_PREFIX) ? refName.slice(REF_HEADS_PREFIX.length) : refName;
}

export function buildAdoPullRequestCreateUrl(
  org: string,
  project: string,
  repositoryId: string,
  repositoryName: string,
  sourceRefName: string,
  targetRefName: string,
): string {
  const url = new URL(
    `https://dev.azure.com/${encodeURIComponent(org)}/${encodeURIComponent(project)}/_git/${encodeURIComponent(repositoryName)}/pullrequestcreate`,
  );
  url.searchParams.set("sourceRef", getShortBranchName(sourceRefName));
  url.searchParams.set("targetRef", getShortBranchName(targetRefName));
  url.searchParams.set("sourceRepositoryId", repositoryId);
  url.searchParams.set("targetRepositoryId", repositoryId);
  return url.toString();
}

export async function findAdoPullRequestCreateCandidates({
  client,
  org,
  project,
  workItemId,
}: FindAdoPullRequestCreateCandidatesOptions): Promise<AdoPullRequestCreateCandidate[]> {
  const branchPrefix = String(workItemId).trim();
  if (!branchPrefix) {
    throw new Error("Work item id is required");
  }

  const repositories = await client.listRepositories();
  const refsByRepository = await Promise.all(
    repositories.map(async (repository) => {
      const repositoryId = repository.id.trim();
      const repositoryName = repository.name.trim();
      const targetRefName = repository.defaultBranch?.trim();
      if (!repositoryId || !repositoryName || !targetRefName) return [];

      const refs = await client.listRefs(repositoryId, `heads/${branchPrefix}`);
      return refs
        .filter((ref) => {
          const refName = ref.name.trim();
          if (!refName.startsWith(REF_HEADS_PREFIX)) return false;
          return getShortBranchName(refName).startsWith(branchPrefix);
        })
        .map((ref) => ({
          repositoryId,
          repositoryName,
           sourceRefName: ref.name.trim(),
           sourceBranchName: getShortBranchName(ref.name.trim()),
           targetRefName,
           targetBranchName: getShortBranchName(targetRefName),
           url: buildAdoPullRequestCreateUrl(
             org,
             project,
             repositoryId,
             repositoryName,
             ref.name.trim(),
             targetRefName,
           ),
         }));
    }),
  );

  return refsByRepository.flat().sort((a, b) => {
    const repositoryNameOrder = a.repositoryName.localeCompare(b.repositoryName);
    if (repositoryNameOrder !== 0) return repositoryNameOrder;
    return a.sourceBranchName.localeCompare(b.sourceBranchName);
  });
}

export function selectAdoPullRequestCreateCandidate(
  candidates: AdoPullRequestCreateCandidate[],
  workItemId: number,
  prompt: OpenAdoPullRequestCreateOptions["prompt"],
): AdoPullRequestCreateCandidate | null {
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  const selection = prompt(
    [
      `Select source branch for work item ${workItemId}:`,
      "",
      ...candidates.map(
        (candidate, index) =>
          `${index + 1}. ${candidate.repositoryName}: ${candidate.sourceBranchName} -> ${candidate.targetBranchName}`,
      ),
      "",
      "Enter branch number:",
    ].join("\n"),
    "1",
  );

  if (selection === null) return null;

  const selectedIndex = Number.parseInt(selection.trim(), 10);
  if (!Number.isInteger(selectedIndex) || selectedIndex < 1 || selectedIndex > candidates.length) {
    throw new Error("Invalid branch selection");
  }

  return candidates[selectedIndex - 1];
}

export async function openAdoPullRequestCreate({
  client,
  org,
  project,
  workItemId,
  clipboard,
  prompt,
  open,
}: OpenAdoPullRequestCreateOptions): Promise<{
  status: "opened" | "cancelled" | "no-match";
  candidate?: AdoPullRequestCreateCandidate;
}> {
  await clipboard.writeText(String(workItemId));

  const candidates = await findAdoPullRequestCreateCandidates({
    client,
    org,
    project,
    workItemId,
  });
  if (candidates.length === 0) {
    return { status: "no-match" };
  }

  const selected = selectAdoPullRequestCreateCandidate(candidates, workItemId, prompt);
  if (!selected) {
    return { status: "cancelled" };
  }

  open(selected.url, "_blank", "noopener,noreferrer");
  return { status: "opened", candidate: selected };
}
