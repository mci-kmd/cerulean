export const LAUNCHER_ENVIRONMENTS = ["sandbox", "dev", "prod"] as const;

export type LauncherEnvironment = (typeof LAUNCHER_ENVIRONMENTS)[number];
export type LauncherEnvironmentUrlField = `${LauncherEnvironment}Url`;

export const LAUNCHER_ENVIRONMENT_LABELS: Record<LauncherEnvironment, string> = {
  sandbox: "Sandbox",
  dev: "Dev",
  prod: "Prod",
};

export const LAUNCHER_ENVIRONMENT_URL_FIELDS: Record<
  LauncherEnvironment,
  LauncherEnvironmentUrlField
> = {
  sandbox: "sandboxUrl",
  dev: "devUrl",
  prod: "prodUrl",
};

export interface LauncherResourceType {
  id: string;
  name: string;
  iconName: string;
  order: number;
}

export interface LauncherResourceItem {
  id: string;
  name: string;
  typeId: string;
  sandboxUrl: string;
  devUrl: string;
  prodUrl: string;
  order: number;
}

export type LauncherResourceChild = LauncherResourceItem;

export interface LauncherResource extends LauncherResourceItem {
  children: LauncherResourceChild[];
}

export type LauncherResourceRecord = LauncherResourceItem & {
  children?: readonly LauncherResourceChild[];
};

function sortByOrder<T extends { order: number; name: string }>(items: readonly T[]) {
  return [...items].sort((left, right) => {
    if (left.order !== right.order) {
      return left.order - right.order;
    }
    return left.name.localeCompare(right.name);
  });
}

export function normalizeLauncherResource(
  resource: LauncherResourceRecord,
): LauncherResource {
  return {
    ...resource,
    children: sortByOrder(resource.children ?? []).map((child) => ({ ...child })),
  };
}

export function getLauncherResourceUrl(
  resource: Pick<LauncherResourceItem, LauncherEnvironmentUrlField>,
  environment: LauncherEnvironment,
) {
  return resource[LAUNCHER_ENVIRONMENT_URL_FIELDS[environment]];
}

export const DEFAULT_LAUNCHER_RESOURCE_TYPES: LauncherResourceType[] = [
  {
    id: "app-service",
    name: "App Service",
    iconName: "AppWindow",
    order: 0,
  },
  {
    id: "function-app",
    name: "Function App",
    iconName: "Workflow",
    order: 1,
  },
  {
    id: "storage-account",
    name: "Storage Account",
    iconName: "Database",
    order: 2,
  },
  {
    id: "key-vault",
    name: "Key Vault",
    iconName: "LockKeyhole",
    order: 3,
  },
  {
    id: "app-insights",
    name: "App Insights",
    iconName: "Activity",
    order: 4,
  },
];
