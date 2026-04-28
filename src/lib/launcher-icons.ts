import { CircleDot, icons, type LucideIcon } from "lucide-react";

type LauncherIconName = keyof typeof icons;

export const LAUNCHER_ICON_NAMES = Object.keys(icons).sort((left, right) =>
  left.localeCompare(right),
);

export function isLauncherIconName(iconName: string): iconName is LauncherIconName {
  return Object.prototype.hasOwnProperty.call(icons, iconName);
}

export function getLauncherIcon(iconName: string | undefined): LucideIcon {
  if (!iconName || !isLauncherIconName(iconName)) {
    return CircleDot;
  }

  return icons[iconName];
}
