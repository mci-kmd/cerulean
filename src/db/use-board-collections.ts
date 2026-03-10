import { useContext } from "react";
import { BoardCollectionsContext } from "./board-collections-context";
import type { BoardCollections } from "./create-collections";

export function useBoardCollections(): BoardCollections {
  const ctx = useContext(BoardCollectionsContext);
  if (!ctx) {
    throw new Error("useBoardCollections must be used within BoardCollectionsProvider");
  }

  return ctx;
}
