import { Check, Undo2, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { DemoChecklist } from "./demo-checklist";
import type { DemoWorkItem } from "@/types/demo";

interface DemoItemProps {
  item: DemoWorkItem;
  isActive: boolean;
  isApproved: boolean;
  onSelect: () => void;
  onApprove: () => void;
  onUnapprove: () => void;
}

export function DemoItem({
  item,
  isActive,
  isApproved,
  onSelect,
  onApprove,
  onUnapprove,
}: DemoItemProps) {
  if (isApproved && !isActive) {
    return (
      <div
        className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted/50 cursor-pointer hover:bg-muted"
        onClick={onSelect}
        role="button"
        aria-label={`Approved: ${item.title}`}
      >
        <Check className="h-4 w-4 text-green-600 shrink-0" />
        <Badge variant="outline" className="text-xs shrink-0">
          {item.type}
        </Badge>
        <span className="text-sm text-muted-foreground">#{item.id}</span>
        <span className="text-sm line-through text-muted-foreground truncate">
          {item.title}
        </span>
      </div>
    );
  }

  return (
    <Card
      className={`cursor-pointer transition-all ${isActive ? "ring-2 ring-ring" : "hover:bg-accent/50"}`}
      onClick={!isActive ? onSelect : undefined}
    >
      <CardHeader className="p-3 pb-0">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs shrink-0">
            {item.type}
          </Badge>
          <span className="text-sm text-muted-foreground">#{item.id}</span>
          <span className="text-sm font-medium truncate flex-1">
            {item.title}
          </span>
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Open in ADO"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </CardHeader>

      {isActive && (
        <CardContent className="p-3 pt-3 space-y-4">
          {item.description && (
            <div>
              <h4 className="text-sm font-medium mb-1">Description</h4>
              <div
                className="prose prose-sm dark:prose-invert max-w-none text-sm"
                dangerouslySetInnerHTML={{ __html: item.description }}
              />
            </div>
          )}

          {item.acceptanceCriteria && (
            <div>
              <h4 className="text-sm font-medium mb-1">
                Acceptance Criteria
              </h4>
              <div
                className="prose prose-sm dark:prose-invert max-w-none text-sm"
                dangerouslySetInnerHTML={{ __html: item.acceptanceCriteria }}
              />
            </div>
          )}

          <DemoChecklist workItemId={item.id} />

          <div className="flex gap-2 pt-2">
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
      )}
    </Card>
  );
}
