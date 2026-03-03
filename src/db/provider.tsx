import { createContext, useContext, type ReactNode } from "react";
import type { BoardCollections } from "./create-collections";

const BoardCollectionsContext = createContext<BoardCollections | null>(null);

export function BoardCollectionsProvider({
  collections,
  children,
}: {
  collections: BoardCollections;
  children: ReactNode;
}) {
  return (
    <BoardCollectionsContext value={collections}>
      {children}
    </BoardCollectionsContext>
  );
}

export function useBoardCollections(): BoardCollections {
  const ctx = useContext(BoardCollectionsContext);
  if (!ctx)
    throw new Error("useBoardCollections must be used within BoardCollectionsProvider");
  return ctx;
}
