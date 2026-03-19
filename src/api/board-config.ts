import type { AdoClient } from "@/api/ado-client";
import {
  buildCandidateBoardConfig,
  pickCandidateBoard,
  type CandidateBoardConfig,
} from "@/lib/ado-board";

export async function fetchCandidateBoardConfig(
  client: AdoClient,
  team: string,
  workItemTypes?: string,
  preferredColumnNames?: string[],
  intakeColumnName?: string,
): Promise<CandidateBoardConfig> {
  const boards = await client.listBoards(team);
  if (boards.length === 0) {
    throw new Error(`No boards found for team ${team}`);
  }

  const details = await Promise.all(
    boards.map((board) => client.getBoard(board.id, team)),
  );
  const selectedBoard = pickCandidateBoard(details, workItemTypes, preferredColumnNames);

  if (!selectedBoard) {
    throw new Error(`No candidate board found for team ${team}`);
  }

  return buildCandidateBoardConfig(selectedBoard, team, intakeColumnName);
}
