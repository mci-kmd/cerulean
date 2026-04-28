import { createElement, useId, useMemo, useState } from "react";
import { nanoid } from "nanoid";
import {
  Cloud,
  ExternalLink,
  Plus,
  Save,
  Shapes,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { useBoardCollections } from "@/db/use-board-collections";
import { useLauncherResourceTypes, useLauncherResources } from "@/hooks/use-resource-launcher";
import {
  getLauncherIcon,
  isLauncherIconName,
  LAUNCHER_ICON_NAMES,
} from "@/lib/launcher-icons";
import {
  LAUNCHER_ENVIRONMENT_LABELS,
  type LauncherResourceType,
} from "@/types/resources";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";

interface AzureResourceLauncherProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ResourceDraft {
  name: string;
  typeId: string;
  sandboxUrl: string;
  devUrl: string;
  prodUrl: string;
}

const SELECT_CLASS_NAME =
  "flex h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30";

function createEmptyResourceDraft(typeId: string): ResourceDraft {
  return {
    name: "",
    typeId,
    sandboxUrl: "",
    devUrl: "",
    prodUrl: "",
  };
}

function normalizeLabel(value: string) {
  return value.trim();
}

function isValidWebUrl(value: string) {
  if (!URL.canParse(value)) {
    return false;
  }

  const parsed = new URL(value);
  return parsed.protocol === "http:" || parsed.protocol === "https:";
}

export function AzureResourceLauncher({
  open,
  onOpenChange,
}: AzureResourceLauncherProps) {
  const collections = useBoardCollections();
  const resources = useLauncherResources();
  const { storedTypes, types: resourceTypes } = useLauncherResourceTypes();
  const [isAddFormOpen, setIsAddFormOpen] = useState(false);
  const [isTypeEditorOpen, setIsTypeEditorOpen] = useState(false);
  const [resourceDraft, setResourceDraft] = useState<ResourceDraft>(() =>
    createEmptyResourceDraft(resourceTypes[0]?.id ?? ""),
  );
  const [typeDrafts, setTypeDrafts] = useState<LauncherResourceType[]>([]);
  const [newTypeName, setNewTypeName] = useState("");
  const [newTypeIconName, setNewTypeIconName] = useState("Cloud");
  const iconOptionsId = useId();

  const resourceTypeMap = useMemo(
    () => new Map(resourceTypes.map((type) => [type.id, type])),
    [resourceTypes],
  );
  const selectedTypeId = resourceTypes.some(
    (type) => type.id === resourceDraft.typeId,
  )
    ? resourceDraft.typeId
    : (resourceTypes[0]?.id ?? "");

  const handleResourceDraftChange = (
    field: keyof ResourceDraft,
    value: string,
  ) => {
    setResourceDraft((current) => ({ ...current, [field]: value }));
  };

  const handleAddResource = () => {
    const name = normalizeLabel(resourceDraft.name);
    if (!name) {
      toast.error("Resource name is required");
      return;
    }

    if (!selectedTypeId) {
      toast.error("Select a valid resource type");
      return;
    }

    const sandboxUrl = resourceDraft.sandboxUrl.trim();
    if (!isValidWebUrl(sandboxUrl)) {
      toast.error("Sandbox link must be a valid http(s) URL");
      return;
    }

    const devUrl = resourceDraft.devUrl.trim();
    if (!isValidWebUrl(devUrl)) {
      toast.error("Dev link must be a valid http(s) URL");
      return;
    }

    const prodUrl = resourceDraft.prodUrl.trim();
    if (!isValidWebUrl(prodUrl)) {
      toast.error("Prod link must be a valid http(s) URL");
      return;
    }

    collections.launcherResources.insert({
      id: nanoid(),
      name,
      typeId: selectedTypeId,
      sandboxUrl,
      devUrl,
      prodUrl,
      order:
        resources.reduce(
          (highestOrder, resource) => Math.max(highestOrder, resource.order),
          -1,
        ) + 1,
    });

    setResourceDraft(createEmptyResourceDraft(resourceTypes[0]?.id ?? ""));
    setIsAddFormOpen(false);
  };

  const handleDeleteResource = (resourceId: string) => {
    if (!collections.launcherResources.get(resourceId)) {
      return;
    }

    collections.launcherResources.delete(resourceId);
  };

  const handleTypeDraftChange = (
    typeId: string,
    field: keyof Pick<LauncherResourceType, "name" | "iconName">,
    value: string,
  ) => {
    setTypeDrafts((current) =>
      current.map((type) =>
        type.id === typeId ? { ...type, [field]: value } : type,
      ),
    );
  };

  const handleAddTypeDraft = () => {
    const name = normalizeLabel(newTypeName);
    if (!name) {
      toast.error("Type name is required");
      return;
    }

    const iconName = newTypeIconName.trim();
    if (!isLauncherIconName(iconName)) {
      toast.error("Pick an icon from the Lucide set");
      return;
    }

    const duplicate = typeDrafts.some(
      (type) => type.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase(),
    );
    if (duplicate) {
      toast.error("Type names must be unique");
      return;
    }

    setTypeDrafts((current) => [
      ...current,
      {
        id: nanoid(),
        name,
        iconName,
        order: current.length,
      },
    ]);
    setNewTypeName("");
    setNewTypeIconName("Cloud");
  };

  const handleRemoveTypeDraft = (typeId: string) => {
    if (typeDrafts.length === 1) {
      toast.error("Keep at least one resource type");
      return;
    }

    setTypeDrafts((current) => current.filter((type) => type.id !== typeId));
  };

  const handleSaveTypeDrafts = () => {
    const normalizedTypes = typeDrafts.map((type, index) => ({
      ...type,
      name: normalizeLabel(type.name),
      iconName: type.iconName.trim(),
      order: index,
    }));

    if (normalizedTypes.some((type) => !type.name)) {
      toast.error("Every resource type needs a name");
      return;
    }

    const invalidType = normalizedTypes.find(
      (type) => !isLauncherIconName(type.iconName),
    );
    if (invalidType) {
      toast.error(`Icon "${invalidType.iconName}" is not available`);
      return;
    }

    const seenNames = new Set<string>();
    for (const type of normalizedTypes) {
      const normalizedName = type.name.toLocaleLowerCase();
      if (seenNames.has(normalizedName)) {
        toast.error("Type names must be unique");
        return;
      }
      seenNames.add(normalizedName);
    }

    const allowedTypeIds = new Set(normalizedTypes.map((type) => type.id));
    const resourceUsingRemovedType = resources.find(
      (resource) => !allowedTypeIds.has(resource.typeId),
    );
    if (resourceUsingRemovedType) {
      toast.error("Can't remove a type that is already in use", {
        description: `${resourceUsingRemovedType.name} still references it.`,
      });
      return;
    }

    const currentIds = new Set(storedTypes.map((type) => type.id));
    const draftIds = new Set(normalizedTypes.map((type) => type.id));

    for (const type of storedTypes) {
      if (!draftIds.has(type.id) && collections.resourceTypes.get(type.id)) {
        collections.resourceTypes.delete(type.id);
      }
    }

    for (const type of normalizedTypes) {
      if (currentIds.has(type.id)) {
        collections.resourceTypes.update(type.id, (draft) => {
          draft.name = type.name;
          draft.iconName = type.iconName;
          draft.order = type.order;
        });
      } else {
        collections.resourceTypes.insert(type);
      }
    }

    setIsTypeEditorOpen(false);
  };

  const toggleTypeEditor = () => {
    setIsTypeEditorOpen((current) => {
      if (!current) {
        setTypeDrafts(resourceTypes.map((type) => ({ ...type })));
      }
      return !current;
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-[88rem] overflow-hidden sm:max-w-[88rem]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-heading">
            <Cloud className="h-5 w-5 text-primary" />
            Azure Portal launcher
          </DialogTitle>
        </DialogHeader>

        <datalist id={iconOptionsId}>
          {LAUNCHER_ICON_NAMES.map((iconName) => (
            <option key={iconName} value={iconName} />
          ))}
        </datalist>

        <div className="flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant={isTypeEditorOpen ? "secondary" : "outline"}
            onClick={toggleTypeEditor}
          >
            <Shapes className="h-4 w-4" />
            Resource types
          </Button>
          <Button
            type="button"
            variant={isAddFormOpen ? "secondary" : "default"}
            onClick={() => setIsAddFormOpen((current) => !current)}
          >
            <Plus className="h-4 w-4" />
            Add resource
          </Button>
        </div>

        <ScrollArea className="max-h-[calc(90vh-11rem)]">
          <div className="space-y-6 pb-1">
            {isAddFormOpen && (
              <section className="rounded-lg border p-4">
                <div className="mb-4">
                  <h3 className="font-medium">Add resource</h3>
                  <p className="text-sm text-muted-foreground">
                    Give the resource a name, pick its icon-driven type, and add one
                    link per environment.
                  </p>
                </div>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                  <div className="space-y-2 xl:col-span-2">
                    <Label htmlFor="launcher-resource-name">Resource name</Label>
                    <Input
                      id="launcher-resource-name"
                      value={resourceDraft.name}
                      onChange={(event) =>
                        handleResourceDraftChange("name", event.target.value)
                      }
                      placeholder="Identity API"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="launcher-resource-type">Resource type</Label>
                    <select
                      id="launcher-resource-type"
                      className={SELECT_CLASS_NAME}
                      value={selectedTypeId}
                      onChange={(event) =>
                        handleResourceDraftChange("typeId", event.target.value)
                      }
                    >
                      {resourceTypes.map((type) => (
                        <option key={type.id} value={type.id}>
                          {type.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="launcher-resource-sandbox-url">Sandbox link</Label>
                    <Input
                      id="launcher-resource-sandbox-url"
                      type="url"
                      value={resourceDraft.sandboxUrl}
                      onChange={(event) =>
                        handleResourceDraftChange("sandboxUrl", event.target.value)
                      }
                      placeholder="https://..."
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="launcher-resource-dev-url">Dev link</Label>
                    <Input
                      id="launcher-resource-dev-url"
                      type="url"
                      value={resourceDraft.devUrl}
                      onChange={(event) =>
                        handleResourceDraftChange("devUrl", event.target.value)
                      }
                      placeholder="https://..."
                    />
                  </div>

                  <div className="space-y-2 xl:col-span-2">
                    <Label htmlFor="launcher-resource-prod-url">Prod link</Label>
                    <Input
                      id="launcher-resource-prod-url"
                      type="url"
                      value={resourceDraft.prodUrl}
                      onChange={(event) =>
                        handleResourceDraftChange("prodUrl", event.target.value)
                      }
                      placeholder="https://..."
                    />
                  </div>
                </div>

                <div className="mt-4 flex justify-end">
                  <Button type="button" onClick={handleAddResource}>
                    <Plus className="h-4 w-4" />
                    Add resource
                  </Button>
                </div>
              </section>
            )}

            {isTypeEditorOpen && (
              <section className="rounded-lg border p-4">
                <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-medium">Resource types</h3>
                    <p className="text-sm text-muted-foreground">
                      Define the labels and Lucide icons available when adding
                      resources.
                    </p>
                  </div>
                  <Button type="button" onClick={handleSaveTypeDrafts}>
                    <Save className="h-4 w-4" />
                    Save types
                  </Button>
                </div>

                <div className="space-y-3">
                  {typeDrafts.map((type) => {
                    const Icon = getLauncherIcon(type.iconName);

                    return (
                      <div
                        key={type.id}
                        className="grid gap-3 rounded-md border p-3 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto]"
                      >
                        <div className="space-y-2">
                          <Label htmlFor={`resource-type-name-${type.id}`}>Type name</Label>
                          <Input
                            id={`resource-type-name-${type.id}`}
                            value={type.name}
                            onChange={(event) =>
                              handleTypeDraftChange(type.id, "name", event.target.value)
                            }
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor={`resource-type-icon-${type.id}`}>Icon</Label>
                          <div className="flex items-center gap-2">
                            <div className="flex h-9 w-9 items-center justify-center rounded-md border bg-muted/30">
                              {createElement(Icon, {
                                className: "h-4 w-4 text-muted-foreground",
                              })}
                            </div>
                            <Input
                              id={`resource-type-icon-${type.id}`}
                              list={iconOptionsId}
                              value={type.iconName}
                              onChange={(event) =>
                                handleTypeDraftChange(
                                  type.id,
                                  "iconName",
                                  event.target.value,
                                )
                              }
                              placeholder="Cloud"
                            />
                          </div>
                        </div>

                        <div className="flex items-end justify-end">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Remove ${type.name || "resource type"}`}
                            onClick={() => handleRemoveTypeDraft(type.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-4 grid gap-3 rounded-md border border-dashed p-3 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto]">
                  <div className="space-y-2">
                    <Label htmlFor="new-resource-type-name">New type name</Label>
                    <Input
                      id="new-resource-type-name"
                      value={newTypeName}
                      onChange={(event) => setNewTypeName(event.target.value)}
                      placeholder="Container App"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="new-resource-type-icon">New type icon</Label>
                    <div className="flex items-center gap-2">
                      <div className="flex h-9 w-9 items-center justify-center rounded-md border bg-muted/30">
                        {createElement(getLauncherIcon(newTypeIconName), {
                          className: "h-4 w-4 text-muted-foreground",
                        })}
                      </div>
                      <Input
                        id="new-resource-type-icon"
                        list={iconOptionsId}
                        value={newTypeIconName}
                        onChange={(event) => setNewTypeIconName(event.target.value)}
                        placeholder="Cloud"
                      />
                    </div>
                  </div>

                  <div className="flex items-end justify-end">
                    <Button type="button" variant="outline" onClick={handleAddTypeDraft}>
                      <Plus className="h-4 w-4" />
                      Add type
                    </Button>
                  </div>
                </div>
              </section>
            )}

            <section className="px-4 pt-1">
              {resources.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
                  <Cloud className="h-10 w-10 text-muted-foreground/70" />
                  <p className="font-medium">No favorited resources yet</p>
                  <p className="max-w-xl text-sm text-muted-foreground">
                    Add a resource to start building your Azure Portal launcher.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <div className="grid min-w-[64rem] grid-cols-[minmax(18rem,2fr)_repeat(3,minmax(8rem,1fr))_auto]">
                    <div className="col-span-full grid items-center [grid-template-columns:subgrid]">
                      <div className="pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Resource
                      </div>
                      <div className="pb-2 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {LAUNCHER_ENVIRONMENT_LABELS.sandbox}
                      </div>
                      <div className="pb-2 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {LAUNCHER_ENVIRONMENT_LABELS.dev}
                      </div>
                      <div className="pb-2 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {LAUNCHER_ENVIRONMENT_LABELS.prod}
                      </div>
                      <div aria-hidden="true" />
                    </div>

                    {resources.map((resource) => {
                      const resourceType = resourceTypeMap.get(resource.typeId);
                      const Icon = getLauncherIcon(resourceType?.iconName);

                      return (
                        <div
                          key={resource.id}
                          className="col-span-full grid items-center [grid-template-columns:subgrid]"
                        >
                          <div className="py-1.5">
                            <div className="flex items-start gap-3">
                              <div className="flex h-9 w-9 items-center justify-center rounded-md border bg-muted/30">
                                {createElement(Icon, {
                                  className: "h-4 w-4 text-muted-foreground",
                                })}
                              </div>
                              <div className="min-w-0">
                                <p className="truncate font-medium">{resource.name}</p>
                                <p className="text-sm text-muted-foreground">
                                  {resourceType?.name ?? "Custom resource"}
                                </p>
                              </div>
                            </div>
                          </div>

                          {[
                            {
                              label: LAUNCHER_ENVIRONMENT_LABELS.sandbox,
                              url: resource.sandboxUrl,
                            },
                            {
                              label: LAUNCHER_ENVIRONMENT_LABELS.dev,
                              url: resource.devUrl,
                            },
                            {
                              label: LAUNCHER_ENVIRONMENT_LABELS.prod,
                              url: resource.prodUrl,
                            },
                          ].map(({ label, url }) => (
                            <div
                              key={label}
                              className="grid place-items-center py-1.5"
                            >
                              <a
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-label={`Open ${resource.name} ${label}`}
                                className="inline-grid grid-flow-col items-center gap-1 text-sm font-medium text-primary hover:underline"
                              >
                                <span>Open</span>
                                <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                            </div>
                          ))}

                          <div className="grid justify-items-end py-1.5">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Delete ${resource.name}`}
                              onClick={() => handleDeleteResource(resource.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </section>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
