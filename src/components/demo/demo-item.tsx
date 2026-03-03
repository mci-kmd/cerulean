import { useState, type Ref } from "react";
import { Check, Undo2, ExternalLink, GripVertical, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { DemoChecklist } from "./demo-checklist";
import { getTypeStyle, getTypeIcon } from "@/lib/work-item-types";
import type { DemoWorkItem } from "@/types/demo";

function CollapsibleSection({
  label,
  html,
  defaultOpen = false,
}: {
  label: string;
  html: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div>
      <button
        type="button"
        className="flex items-center gap-1 text-xs font-medium text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground transition-colors"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <ChevronRight
          className={`h-3.5 w-3.5 transition-transform duration-200 ${open ? "rotate-90" : ""}`}
        />
        {label}
      </button>
      <div
        className="grid transition-[grid-template-rows] duration-200 ease-out"
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          <div
            className="prose prose-sm max-w-none text-sm leading-relaxed pt-1.5"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </div>
      </div>
    </div>
  );
}

interface DemoItemProps {
  item: DemoWorkItem;
  isActive: boolean;
  isApproved: boolean;
  onSelect: () => void;
  onApprove: () => void;
  onUnapprove: () => void;
  sortableRef?: Ref<HTMLElement>;
  isDragSource?: boolean;
}

export function DemoItem({
  item,
  isActive,
  isApproved,
  onSelect,
  onApprove,
  onUnapprove,
  sortableRef,
  isDragSource,
}: DemoItemProps) {
  const style = getTypeStyle(item.type);
  const TypeIcon = getTypeIcon(item.type);

  if (isApproved && !isActive) {
    return (
      <div
        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={onSelect}
        role="button"
        aria-label={`Approved: ${item.title}`}
      >
        <Check className="h-4 w-4 text-emerald-500 shrink-0" />
        <TypeIcon className={`h-3.5 w-3.5 shrink-0 ${style.text}`} />
        <span className="text-[11px] text-muted-foreground font-mono">#{item.id}</span>
        <span className="text-sm line-through text-muted-foreground truncate">
          {item.title}
        </span>
      </div>
    );
  }

  return (
    <Card
      ref={sortableRef as Ref<HTMLDivElement>}
      className={`transition-all border-l-[3px] ${style.border} ${isActive ? "ring-2 ring-primary/30" : "hover:shadow-md hover:-translate-y-px"} ${isDragSource ? "opacity-50 scale-[0.97]" : ""}`}
    >
      <CardHeader className="p-3 pb-0">
        <div className="flex items-center gap-2">
          <GripVertical
            className="h-4 w-4 text-muted-foreground/40 shrink-0 cursor-grab active:cursor-grabbing"
            aria-label="Drag to reorder"
          />
          <TypeIcon className={`h-3.5 w-3.5 shrink-0 ${style.text}`} />
          <span className="text-[11px] text-muted-foreground font-mono">#{item.id}</span>
          <span
            className="text-sm font-medium truncate flex-1 cursor-pointer"
            onClick={!isActive ? onSelect : undefined}
          >
            {item.title}
          </span>
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-muted-foreground/50 hover:text-foreground transition-colors"
            aria-label="Open in ADO"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </CardHeader>

      <div
        className="grid transition-[grid-template-rows] duration-200 ease-out"
        style={{ gridTemplateRows: isActive ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          <CardContent className="p-3 pt-3 space-y-4">
            {item.description && (
              <CollapsibleSection label="Description" html={item.description} />
            )}

            {item.description && item.acceptanceCriteria && <Separator />}

            {item.acceptanceCriteria && (
              <CollapsibleSection label="Acceptance Criteria" html={item.acceptanceCriteria} defaultOpen />
            )}

            <Separator />

            <DemoChecklist workItemId={item.id} />

            <div className="flex gap-2 pt-1">
              {isApproved ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onUnapprove();
                  }}
                >
                  <Undo2 className="h-3.5 w-3.5 mr-1" />
                  Unapprove
                </Button>
              ) : (
                <Button
                  size="sm"
                  className="bg-emerald-600 text-white hover:bg-emerald-700"
                  onClick={(e) => {
                    e.stopPropagation();
                    onApprove();
                  }}
                >
                  <Check className="h-3.5 w-3.5 mr-1" />
                  Approve
                </Button>
              )}
            </div>
          </CardContent>
        </div>
      </div>
    </Card>
  );
}
