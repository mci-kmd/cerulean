import type { AdoGitItem } from "@/types/ado";

const filenameTokenPatterns = {
  "{date}": "(?<date>\\d{4}-\\d{2}-\\d{2})",
  "{yyyy}": "(?<year>\\d{4})",
  "{MM}": "(?<month>\\d{2})",
  "{dd}": "(?<day>\\d{2})",
} as const;

const isoDatePattern = /\b\d{4}-\d{2}-\d{2}\b/;
const datePlaceholderPattern = /\bDATE\b/;
const sectionHeadingPattern = /^(#{1,6})\s+(.*\S)\s*$/;
const carryForwardSourcePattern = /solution|decision|action item|follow[- ]?up|review/i;
const followUpTargetPattern = /^follow up on previous retrospectives$/i;
const listItemPattern = /^\s*(?:[-*+]|\d+\.)\s+(.*\S)\s*$/;
const checklistItemPattern = /^\s*[-*+]\s+\[(?: |x|X)\]\s+(.*\S)\s*$/;

interface RetroSection {
  headingLine: string;
  headingDepth: number;
  headingText: string;
  bodyLines: string[];
}

export interface PreparedRetroDraft {
  content: string;
  reviewItems: string[];
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function formatRetroDatePart(value: number): string {
  return String(value).padStart(2, "0");
}

export function formatRetroDate(date: Date): string {
  return [
    String(date.getFullYear()),
    formatRetroDatePart(date.getMonth() + 1),
    formatRetroDatePart(date.getDate()),
  ].join("-");
}

export function normalizeRetroFolder(folder: string): string {
  const normalized = folder.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  return normalized ? `/${normalized}` : "";
}

export function buildRetroFilename(pattern: string, date: Date): string {
  const isoDate = formatRetroDate(date);
  return pattern
    .replaceAll("{date}", isoDate)
    .replaceAll("{yyyy}", String(date.getFullYear()))
    .replaceAll("{MM}", formatRetroDatePart(date.getMonth() + 1))
    .replaceAll("{dd}", formatRetroDatePart(date.getDate()));
}

export function buildRetroFilePath(folder: string, filename: string): string {
  const normalizedFolder = normalizeRetroFolder(folder);
  const trimmedFilename = filename.trim().replace(/\\/g, "/").replace(/^\/+/, "");
  if (!trimmedFilename) {
    throw new Error("Retro filename is required");
  }
  return normalizedFolder ? `${normalizedFolder}/${trimmedFilename}` : `/${trimmedFilename}`;
}

export function buildRetroTemplatePath(folder: string): string {
  return buildRetroFilePath(folder, "Template.md");
}

function createFilenameMatcher(pattern: string): RegExp {
  const tokenPattern = /\{date\}|\{yyyy\}|\{MM\}|\{dd\}/g;
  let lastIndex = 0;
  let regexSource = "";
  for (const match of pattern.matchAll(tokenPattern)) {
    const token = match[0];
    const index = match.index ?? 0;
    regexSource += escapeRegex(pattern.slice(lastIndex, index));
    regexSource += filenameTokenPatterns[token as keyof typeof filenameTokenPatterns];
    lastIndex = index + token.length;
  }
  regexSource += escapeRegex(pattern.slice(lastIndex));
  return new RegExp(`^${regexSource}$`, "i");
}

function parseDateFromFilename(filename: string, pattern: string): Date | null {
  const match = createFilenameMatcher(pattern).exec(filename);
  if (!match?.groups) return null;
  const isoDate = match.groups.date
    ? match.groups.date
    : [match.groups.year, match.groups.month, match.groups.day].every(Boolean)
      ? `${match.groups.year}-${match.groups.month}-${match.groups.day}`
      : null;
  if (!isoDate || !isoDatePattern.test(isoDate)) return null;
  const parsed = new Date(`${isoDate}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getFileName(path: string): string {
  const parts = path.replace(/\\/g, "/").split("/");
  return parts[parts.length - 1] ?? path;
}

export function findLatestRetroFile(
  items: AdoGitItem[],
  filenamePattern: string,
): AdoGitItem | null {
  const datedItems = items
    .filter((item) => !item.isFolder)
    .map((item) => ({
      item,
      fileName: getFileName(item.path),
      parsedDate: parseDateFromFilename(getFileName(item.path), filenamePattern),
    }))
    .filter((entry) => entry.parsedDate !== null)
    .sort((a, b) => {
      const byDate = b.parsedDate!.getTime() - a.parsedDate!.getTime();
      if (byDate !== 0) return byDate;
      return b.fileName.localeCompare(a.fileName);
    });

  if (datedItems.length > 0) {
    return datedItems[0].item;
  }

  const markdownItems = items
    .filter((item) => !item.isFolder && item.path.toLowerCase().endsWith(".md"))
    .sort((a, b) => b.path.localeCompare(a.path));
  return markdownItems[0] ?? null;
}

function replaceDateTokens(line: string, nextDate: string): string {
  return line.replace(isoDatePattern, nextDate).replace(datePlaceholderPattern, nextDate);
}

function normalizeCarryForwardItem(text: string): string {
  return `- [ ] ${text.trim()}`;
}

function extractCarryForwardItems(lines: string[]): string[] {
  return lines
    .map((line) => checklistItemPattern.exec(line)?.[1] ?? listItemPattern.exec(line)?.[1] ?? "")
    .map((item) => item.trim())
    .filter(Boolean)
    .map(normalizeCarryForwardItem);
}

function parseSections(markdown: string): RetroSection[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const sections: RetroSection[] = [];
  let current: RetroSection | null = null;

  for (const line of lines) {
    const headingMatch = sectionHeadingPattern.exec(line);
    if (headingMatch) {
      current = {
        headingLine: line,
        headingDepth: headingMatch[1].length,
        headingText: headingMatch[2].trim(),
        bodyLines: [],
      };
      sections.push(current);
      continue;
    }

    if (!current) {
      current = {
        headingLine: "# Retro",
        headingDepth: 1,
        headingText: "Retro",
        bodyLines: [],
      };
      sections.push(current);
    }
    current.bodyLines.push(line);
  }

  return sections;
}

function trimTrailingBlankLines(lines: string[]): string[] {
  const trimmed = [...lines];
  while (trimmed.length > 0 && trimmed[trimmed.length - 1] === "") {
    trimmed.pop();
  }
  return trimmed;
}

function trimLeadingBlankLines(lines: string[]): string[] {
  const trimmed = [...lines];
  while (trimmed.length > 0 && trimmed[0] === "") {
    trimmed.shift();
  }
  return trimmed;
}

function trimBlankLines(lines: string[]): string[] {
  return trimTrailingBlankLines(trimLeadingBlankLines(lines));
}

function getSectionRangeEnd(sections: RetroSection[], startIndex: number): number {
  const rootDepth = sections[startIndex]?.headingDepth ?? 0;
  let endIndex = startIndex + 1;
  while (endIndex < sections.length && sections[endIndex].headingDepth > rootDepth) {
    endIndex += 1;
  }
  return endIndex;
}

function renderSectionSubtreeBody(sections: RetroSection[], startIndex: number): string[] {
  const endIndex = getSectionRangeEnd(sections, startIndex);
  const lines = [...sections[startIndex].bodyLines];
  for (let index = startIndex + 1; index < endIndex; index += 1) {
    if (lines.length > 0 && lines[lines.length - 1] !== "") {
      lines.push("");
    }
    lines.push(sections[index].headingLine, ...sections[index].bodyLines);
  }
  return trimBlankLines(lines);
}

function renderCarryForwardBlock(
  sections: RetroSection[],
  sectionIndex: number,
  targetHeadingDepth: number,
): string[] {
  const section = sections[sectionIndex];
  const subtreeBody = renderSectionSubtreeBody(sections, sectionIndex);
  if (subtreeBody.length === 0) {
    return [];
  }

  const hasNestedSections = getSectionRangeEnd(sections, sectionIndex) > sectionIndex + 1;
  const ownBody = trimBlankLines(section.bodyLines);
  if (hasNestedSections && ownBody.length === 0) {
    return subtreeBody;
  }

  const headingDepth = Math.min(targetHeadingDepth + 1, 6);
  return [`${"#".repeat(headingDepth)} ${section.headingText}`, ...subtreeBody];
}

function appendBlock(target: string[], block: string[]): void {
  const normalizedBlock = trimBlankLines(block);
  if (normalizedBlock.length === 0) {
    return;
  }
  if (target.length > 0) {
    target.push("");
  }
  target.push(...normalizedBlock);
}

function uniqueItems(items: string[]): string[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.trim().toLowerCase();
    if (!key || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function collectFollowUpLines(previousSections: RetroSection[], targetHeadingDepth: number): string[] {
  const followUpLines: string[] = [];
  const consumedRanges: Array<[number, number]> = [];
  const followUpIndex = previousSections.findIndex((section) =>
    followUpTargetPattern.test(section.headingText),
  );

  if (followUpIndex >= 0) {
    appendBlock(followUpLines, renderSectionSubtreeBody(previousSections, followUpIndex));
    consumedRanges.push([followUpIndex, getSectionRangeEnd(previousSections, followUpIndex)]);
  }

  for (let index = 0; index < previousSections.length; index += 1) {
    if (
      consumedRanges.some(([start, end]) => index >= start && index < end) ||
      !carryForwardSourcePattern.test(previousSections[index].headingText)
    ) {
      continue;
    }

    appendBlock(
      followUpLines,
      renderCarryForwardBlock(previousSections, index, targetHeadingDepth),
    );
    consumedRanges.push([index, getSectionRangeEnd(previousSections, index)]);
  }

  return followUpLines;
}

export function prepareRetroDraft(
  templateMarkdown: string,
  previousMarkdown: string,
  nextDate: Date,
): PreparedRetroDraft {
  const cleanedTemplateMarkdown = templateMarkdown.replace(/<!--[\s\S]*?-->/g, "").trim();
  const sections = parseSections(cleanedTemplateMarkdown);
  if (sections.length === 0) {
    throw new Error("Retro template must include at least one markdown heading");
  }

  const formattedDate = formatRetroDate(nextDate);
  sections[0].headingLine = replaceDateTokens(sections[0].headingLine, formattedDate);
  sections[0].bodyLines = sections[0].bodyLines.map((line) => replaceDateTokens(line, formattedDate));

  const cleanedPreviousMarkdown = previousMarkdown.replace(/<!--[\s\S]*?-->/g, "").trim();
  const previousSections = cleanedPreviousMarkdown ? parseSections(cleanedPreviousMarkdown) : [];
  const followUpSectionIndex = sections.findIndex((section) =>
    followUpTargetPattern.test(section.headingText),
  );
  const followUpHeadingDepth = followUpSectionIndex >= 0 ? sections[followUpSectionIndex].headingDepth : 2;
  const followUpLines = collectFollowUpLines(previousSections, followUpHeadingDepth);
  const followUpItems = uniqueItems(extractCarryForwardItems(followUpLines));

  if (followUpLines.length > 0) {
    const nextBodyLines = ["", ...followUpLines];
    if (followUpSectionIndex >= 0) {
      sections[followUpSectionIndex].bodyLines = nextBodyLines;
    } else {
      sections.splice(1, 0, {
        headingLine: "## Follow up on previous retrospectives",
        headingDepth: 2,
        headingText: "Follow up on previous retrospectives",
        bodyLines: nextBodyLines,
      });
    }
  }

  const rendered = trimTrailingBlankLines(
    sections.flatMap((section) => [
      section.headingLine,
      ...trimTrailingBlankLines(section.bodyLines),
      "",
    ]),
  ).join("\n");

  return {
    content: rendered,
    reviewItems: followUpItems,
  };
}
