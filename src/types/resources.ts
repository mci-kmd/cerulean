export const LAUNCHER_ENVIRONMENTS = ["sandbox", "dev", "prod"] as const;

export type LauncherEnvironment = (typeof LAUNCHER_ENVIRONMENTS)[number];

export const LAUNCHER_ENVIRONMENT_LABELS: Record<LauncherEnvironment, string> = {
  sandbox: "Sandbox",
  dev: "Dev",
  prod: "Prod",
};

export interface LauncherResourceType {
  id: string;
  name: string;
  iconName: string;
  order: number;
}

export interface LauncherResource {
  id: string;
  name: string;
  typeId: string;
  sandboxUrl: string;
  devUrl: string;
  prodUrl: string;
  order: number;
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
];
