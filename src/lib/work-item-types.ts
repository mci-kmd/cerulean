import { Bug, BookOpen, ClipboardList, CircleDot, type LucideIcon } from "lucide-react";

export interface TypeStyle {
  border: string;
  bg: string;
  text: string;
  badge: string;
  stripe: string;
}

const BUG_STYLE: TypeStyle = {
  border: "border-l-red-400",
  bg: "bg-red-50",
  text: "text-red-600",
  badge: "bg-red-50 text-red-700 border-red-200",
  stripe: "rgba(248, 113, 113, 0.18)",
};

const USER_STORY_STYLE: TypeStyle = {
  border: "border-l-primary",
  bg: "bg-primary/5",
  text: "text-primary",
  badge: "bg-primary/5 text-primary border-primary/20",
  stripe: "rgba(59, 130, 246, 0.14)",
};

const TASK_STYLE: TypeStyle = {
  border: "border-l-amber-400",
  bg: "bg-amber-50",
  text: "text-amber-600",
  badge: "bg-amber-50 text-amber-700 border-amber-200",
  stripe: "rgba(251, 191, 36, 0.16)",
};

const FALLBACK_STYLE: TypeStyle = {
  border: "border-l-slate-300",
  bg: "bg-slate-50",
  text: "text-slate-500",
  badge: "bg-slate-50 text-slate-600 border-slate-200",
  stripe: "rgba(148, 163, 184, 0.16)",
};

const TYPE_STYLES: Record<string, TypeStyle> = {
  Bug: BUG_STYLE,
  "User Story": USER_STORY_STYLE,
  Task: TASK_STYLE,
};

const TYPE_ICONS: Record<string, LucideIcon> = {
  Bug: Bug,
  "User Story": BookOpen,
  Task: ClipboardList,
};

export function getTypeStyle(type: string): TypeStyle {
  return TYPE_STYLES[type] ?? FALLBACK_STYLE;
}

export function getTypeIcon(type: string): LucideIcon {
  return TYPE_ICONS[type] ?? CircleDot;
}

export const CUSTOM_TASK_TYPE = "Task";
