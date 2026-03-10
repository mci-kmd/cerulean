import { createContext } from "react";
import type { BoardCollections } from "./create-collections";

export const BoardCollectionsContext = createContext<BoardCollections | null>(null);
