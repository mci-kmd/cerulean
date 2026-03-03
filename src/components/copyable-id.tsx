import { useState } from "react";
import { Check, Copy } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface CopyableIdProps {
  id: number;
  className?: string;
}

export function CopyableId({ id, className = "" }: CopyableIdProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(String(id));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={handleCopy}
          className={`group/id inline-flex items-center gap-0.5 text-muted-foreground font-mono cursor-pointer hover:text-foreground transition-colors shrink-0 ${className}`}
          aria-label={`Copy ID ${id}`}
        >
          #{id}
          {copied ? (
            <Check className="h-3 w-3 text-emerald-500" />
          ) : (
            <Copy className="h-3 w-3 opacity-0 group-hover/id:opacity-100 transition-opacity" />
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent>{copied ? "Copied!" : "Copy ID"}</TooltipContent>
    </Tooltip>
  );
}
