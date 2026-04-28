import { Fragment, createElement, useId, useMemo, useState } from "react";
import { nanoid } from "nanoid";
import {
  Cloud,
  Pencil,
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
  getLauncherResourceUrl,
  LAUNCHER_ENVIRONMENTS,
  LAUNCHER_ENVIRONMENT_LABELS,
  type LauncherEnvironment,
  type LauncherResource,
  type LauncherResourceChild,
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

type ResourceDraftField = "name" | "typeId" | "sandboxUrl" | "devUrl" | "prodUrl";

interface ResourceDraft {
  name: string;
  typeId: string;
  sandboxUrl: string;
  devUrl: string;
  prodUrl: string;
  children: LauncherResourceChild[];
}

interface ResourceEditorState {
  mode: "add" | "edit";
  resourceId?: string;
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
    children: [],
  };
}

function createEmptyChildDraft(typeId: string, order: number): LauncherResourceChild {
  return {
    id: nanoid(),
    name: "",
    typeId,
    sandboxUrl: "",
    devUrl: "",
    prodUrl: "",
    order,
  };
}

function createDraftFromResource(resource: LauncherResource): ResourceDraft {
  return {
    name: resource.name,
    typeId: resource.typeId,
    sandboxUrl: resource.sandboxUrl,
    devUrl: resource.devUrl,
    prodUrl: resource.prodUrl,
    children: resource.children.map((child) => ({ ...child })),
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

function resolveTypeId(typeId: string, resourceTypes: readonly LauncherResourceType[]) {
  return resourceTypes.some((type) => type.id === typeId)
    ? typeId
    : (resourceTypes[0]?.id ?? "");
}

function ResourceDraftFields({
  title,
  description,
  prefix,
  item,
  resourceTypes,
  onChange,
  onRemove,
}: {
  title: string;
  description: string;
  prefix: string;
  item: Pick<LauncherResourceChild, ResourceDraftField>;
  resourceTypes: LauncherResourceType[];
  onChange: (field: ResourceDraftField, value: string) => void;
  onRemove?: () => void;
}) {
  return (
    <section className="rounded-md border bg-muted/10 p-4">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="font-medium">{title}</h4>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>

        {onRemove ? (
          <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
            <Trash2 className="h-4 w-4" />
            Remove
          </Button>
        ) : null}
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <div className="space-y-2 xl:col-span-2">
          <Label htmlFor={`${prefix}-name`}>Resource name</Label>
          <Input
            id={`${prefix}-name`}
            value={item.name}
            onChange={(event) => onChange("name", event.target.value)}
            placeholder="Identity API"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor={`${prefix}-type`}>Resource type</Label>
          <select
            id={`${prefix}-type`}
            className={SELECT_CLASS_NAME}
            value={resolveTypeId(item.typeId, resourceTypes)}
            onChange={(event) => onChange("typeId", event.target.value)}
          >
            {resourceTypes.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor={`${prefix}-sandbox`}>Sandbox link</Label>
          <Input
            id={`${prefix}-sandbox`}
            type="url"
            value={item.sandboxUrl}
            onChange={(event) => onChange("sandboxUrl", event.target.value)}
            placeholder="https://..."
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor={`${prefix}-dev`}>Dev link</Label>
          <Input
            id={`${prefix}-dev`}
            type="url"
            value={item.devUrl}
            onChange={(event) => onChange("devUrl", event.target.value)}
            placeholder="https://..."
          />
        </div>

        <div className="space-y-2 xl:col-span-2">
          <Label htmlFor={`${prefix}-prod`}>Prod link</Label>
          <Input
            id={`${prefix}-prod`}
            type="url"
            value={item.prodUrl}
            onChange={(event) => onChange("prodUrl", event.target.value)}
            placeholder="https://..."
          />
        </div>
      </div>
    </section>
  );
}

function EnvironmentLinks({
  environment,
  resource,
  resourceTypeMap,
}: {
  environment: LauncherEnvironment;
  resource: LauncherResource;
  resourceTypeMap: Map<string, LauncherResourceType>;
}) {
  const links = [
    {
      id: resource.id,
      name: resource.name,
      typeName: resourceTypeMap.get(resource.typeId)?.name ?? resource.name,
      url: getLauncherResourceUrl(resource, environment),
    },
    ...resource.children.map((child) => ({
      id: child.id,
      name: child.name,
      typeName: resourceTypeMap.get(child.typeId)?.name ?? child.name,
      url: getLauncherResourceUrl(child, environment),
    })),
  ];

  return (
    <div className="flex flex-wrap items-center justify-center gap-1.5 py-1.5 text-sm">
      {links.map((link, index) => (
        <Fragment key={`${environment}-${link.id}`}>
          {index > 0 ? <span className="text-muted-foreground">|</span> : null}
          <a
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Open ${link.name} ${link.typeName} ${LAUNCHER_ENVIRONMENT_LABELS[environment]}`}
            className="font-medium text-primary hover:underline"
          >
            {link.typeName}
          </a>
        </Fragment>
      ))}
    </div>
  );
}

export function AzureResourceLauncher({
  open,
  onOpenChange,
}: AzureResourceLauncherProps) {
  const collections = useBoardCollections();
  const resources = useLauncherResources();
  const { storedTypes, types: resourceTypes } = useLauncherResourceTypes();
  const defaultTypeId = resourceTypes[0]?.id ?? "";
  const [resourceEditorState, setResourceEditorState] = useState<ResourceEditorState | null>(
    null,
  );
  const [isTypeEditorOpen, setIsTypeEditorOpen] = useState(false);
  const [resourceDraft, setResourceDraft] = useState<ResourceDraft>(() =>
    createEmptyResourceDraft(defaultTypeId),
  );
  const [typeDrafts, setTypeDrafts] = useState<LauncherResourceType[]>([]);
  const [newTypeName, setNewTypeName] = useState("");
  const [newTypeIconName, setNewTypeIconName] = useState("Cloud");
  const iconOptionsId = useId();

  const resourceTypeMap = useMemo(
    () => new Map(resourceTypes.map((type) => [type.id, type])),
    [resourceTypes],
  );

  const closeResourceEditor = () => {
    setResourceEditorState(null);
    setResourceDraft(createEmptyResourceDraft(defaultTypeId));
  };

  const startAddResource = () => {
    setResourceEditorState({ mode: "add" });
    setResourceDraft(createEmptyResourceDraft(defaultTypeId));
  };

  const startEditResource = (resource: LauncherResource) => {
    setResourceEditorState({ mode: "edit", resourceId: resource.id });
    setResourceDraft(createDraftFromResource(resource));
  };

  const handleResourceDraftChange = (field: ResourceDraftField, value: string) => {
    setResourceDraft((current) => ({ ...current, [field]: value }));
  };

  const handleChildDraftChange = (
    childId: string,
    field: ResourceDraftField,
    value: string,
  ) => {
    setResourceDraft((current) => ({
      ...current,
      children: current.children.map((child) =>
        child.id === childId ? { ...child, [field]: value } : child,
      ),
    }));
  };

  const handleAddChildDraft = () => {
    setResourceDraft((current) => ({
      ...current,
      children: [
        ...current.children,
        createEmptyChildDraft(defaultTypeId, current.children.length),
      ],
    }));
  };

  const handleRemoveChildDraft = (childId: string) => {
    setResourceDraft((current) => ({
      ...current,
      children: current.children.filter((child) => child.id !== childId),
    }));
  };

  const handleSaveResource = () => {
    const name = normalizeLabel(resourceDraft.name);
    if (!name) {
      toast.error("Resource name is required");
      return;
    }

    const typeId = resourceDraft.typeId.trim();
    if (!resourceTypeMap.has(typeId)) {
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

    const editorState = resourceEditorState;
    if (!editorState) {
      return;
    }

    let nextResource: LauncherResource;
    try {
      const children = resourceDraft.children.map((child, index) => {
        const childName = normalizeLabel(child.name);
        if (!childName) {
          throw new Error(`Child resource ${index + 1} needs a name`);
        }

        const childTypeId = child.typeId.trim();
        if (!resourceTypeMap.has(childTypeId)) {
          throw new Error(`Child resource ${index + 1} needs a valid type`);
        }

        const childSandboxUrl = child.sandboxUrl.trim();
        if (!isValidWebUrl(childSandboxUrl)) {
          throw new Error(`Child resource ${index + 1} has an invalid sandbox link`);
        }

        const childDevUrl = child.devUrl.trim();
        if (!isValidWebUrl(childDevUrl)) {
          throw new Error(`Child resource ${index + 1} has an invalid dev link`);
        }

        const childProdUrl = child.prodUrl.trim();
        if (!isValidWebUrl(childProdUrl)) {
          throw new Error(`Child resource ${index + 1} has an invalid prod link`);
        }

        return {
          ...child,
          name: childName,
          typeId: childTypeId,
          sandboxUrl: childSandboxUrl,
          devUrl: childDevUrl,
          prodUrl: childProdUrl,
          order: index,
        };
      });

      nextResource = {
        id: editorState.resourceId ?? nanoid(),
        name,
        typeId,
        sandboxUrl,
        devUrl,
        prodUrl,
        order:
          editorState.mode === "edit"
            ? (resources.find((resource) => resource.id === editorState.resourceId)?.order ?? 0)
            : resources.reduce(
                (highestOrder, resource) => Math.max(highestOrder, resource.order),
                -1,
              ) + 1,
        children,
      };
    } catch (error) {
      toast.error("Couldn't save resource", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
      return;
    }

    if (editorState.mode === "edit") {
      const existing = editorState.resourceId
        ? collections.launcherResources.get(editorState.resourceId)
        : undefined;
      if (!existing || !editorState.resourceId) {
        toast.error("Resource no longer exists");
        return;
      }

      collections.launcherResources.update(editorState.resourceId, (draft) => {
        draft.name = nextResource.name;
        draft.typeId = nextResource.typeId;
        draft.sandboxUrl = nextResource.sandboxUrl;
        draft.devUrl = nextResource.devUrl;
        draft.prodUrl = nextResource.prodUrl;
        draft.children = nextResource.children;
      });
    } else {
      collections.launcherResources.insert(nextResource);
    }

    closeResourceEditor();
  };

  const handleDeleteResource = (resourceId: string) => {
    if (!collections.launcherResources.get(resourceId)) {
      return;
    }

    if (resourceEditorState?.resourceId === resourceId) {
      closeResourceEditor();
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
      (resource) =>
        !allowedTypeIds.has(resource.typeId) ||
        resource.children.some((child) => !allowedTypeIds.has(child.typeId)),
    );
    if (resourceUsingRemovedType) {
      const blockedChild = resourceUsingRemovedType.children.find(
        (child) => !allowedTypeIds.has(child.typeId),
      );
      toast.error("Can't remove a type that is already in use", {
        description: blockedChild
          ? `${resourceUsingRemovedType.name} -> ${blockedChild.name} still references it.`
          : `${resourceUsingRemovedType.name} still references it.`,
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
      <DialogContent
        aria-describedby={undefined}
        className="max-h-[90vh] max-w-[88rem] overflow-hidden sm:max-w-[88rem]"
      >
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
            variant={resourceEditorState?.mode === "add" ? "secondary" : "default"}
            onClick={startAddResource}
          >
            <Plus className="h-4 w-4" />
            Add resource
          </Button>
        </div>

        <ScrollArea className="max-h-[calc(90vh-11rem)]">
          <div className="space-y-6 pb-1">
            {resourceEditorState ? (
              <section className="rounded-lg border p-4">
                <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-medium">
                      {resourceEditorState.mode === "edit" ? "Edit resource" : "Add resource"}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      The root resource launches first in each environment column.
                      Add child resources to append more typed links beside it.
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" onClick={closeResourceEditor}>
                      Cancel
                    </Button>
                    <Button type="button" onClick={handleSaveResource}>
                      <Save className="h-4 w-4" />
                      {resourceEditorState.mode === "edit" ? "Save changes" : "Save resource"}
                    </Button>
                  </div>
                </div>

                <div className="space-y-4">
                  <ResourceDraftFields
                    title="Root resource"
                    description="Main entry shown in the launcher table."
                    prefix="launcher-resource-root"
                    item={resourceDraft}
                    resourceTypes={resourceTypes}
                    onChange={handleResourceDraftChange}
                  />

                  <section className="rounded-md border border-dashed p-4">
                    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h4 className="font-medium">Child resources</h4>
                        <p className="text-sm text-muted-foreground">
                          Each child adds one more typed link in every environment
                          column.
                        </p>
                      </div>

                      <Button type="button" variant="outline" onClick={handleAddChildDraft}>
                        <Plus className="h-4 w-4" />
                        Add child resource
                      </Button>
                    </div>

                    {resourceDraft.children.length === 0 ? (
                      <div className="rounded-md border border-dashed px-4 py-6 text-sm text-muted-foreground">
                        No child resources yet.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {resourceDraft.children.map((child, index) => (
                          <ResourceDraftFields
                            key={child.id}
                            title={`Child resource ${index + 1}`}
                            description="Appears after the root resource in each environment."
                            prefix={`launcher-resource-child-${child.id}`}
                            item={child}
                            resourceTypes={resourceTypes}
                            onChange={(field, value) =>
                              handleChildDraftChange(child.id, field, value)
                            }
                            onRemove={() => handleRemoveChildDraft(child.id)}
                          />
                        ))}
                      </div>
                    )}
                  </section>
                </div>
              </section>
            ) : null}

            {isTypeEditorOpen ? (
              <section className="rounded-lg border p-4">
                <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-medium">Resource types</h3>
                    <p className="text-sm text-muted-foreground">
                      Define the labels and Lucide icons available when editing
                      resources and child resources.
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
            ) : null}

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
                  <div className="grid min-w-[76rem] grid-cols-[minmax(18rem,2fr)_repeat(3,minmax(13rem,1fr))_auto]">
                    <div className="col-span-full grid items-center [grid-template-columns:subgrid]">
                      <div className="pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Resource
                      </div>
                      {LAUNCHER_ENVIRONMENTS.map((environment) => (
                        <div
                          key={environment}
                          className="pb-2 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                        >
                          {LAUNCHER_ENVIRONMENT_LABELS[environment]}
                        </div>
                      ))}
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
                          <div className="py-2">
                            <div className="flex items-center gap-2">
                              {createElement(Icon, {
                                className: "h-4 w-4 shrink-0 text-muted-foreground",
                              })}
                              <div className="min-w-0">
                                <p className="truncate font-medium">{resource.name}</p>
                              </div>
                            </div>
                          </div>

                          {LAUNCHER_ENVIRONMENTS.map((environment) => (
                            <div
                              key={`${resource.id}-${environment}`}
                              className="grid place-items-center"
                            >
                              <EnvironmentLinks
                                environment={environment}
                                resource={resource}
                                resourceTypeMap={resourceTypeMap}
                              />
                            </div>
                          ))}

                          <div className="grid justify-items-end py-2">
                            <div className="flex items-center gap-1">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                aria-label={`Edit ${resource.name}`}
                                onClick={() => startEditResource(resource)}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
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
