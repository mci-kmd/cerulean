import type { ReactNode } from "react";
import { BoardCollectionsContext } from "./board-collections-context";
import type { BoardCollections } from "./create-collections";

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
