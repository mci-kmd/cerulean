import { http, HttpResponse } from "msw";
import { createWiqlResponse, createBatchResponse } from "../fixtures/ado-responses";

const BASE = "https://dev.azure.com/test-org/test-project";

export const handlers = [
  http.get(`${BASE}/test-project/_apis/work/boards`, () => {
    return HttpResponse.json({
      value: [
        {
          id: "board-stories",
          name: "Stories",
          url: `${BASE}/test-project/_apis/work/boards/board-stories`,
        },
      ],
    });
  }),

  http.get(`${BASE}/test-project/_apis/work/boards/:boardId`, () => {
    return HttpResponse.json({
      id: "board-stories",
      name: "Stories",
      url: `${BASE}/test-project/_apis/work/boards/board-stories`,
      fields: {
        columnField: { referenceName: "WEF_FAKE_Kanban.Column" },
        doneField: { referenceName: "WEF_FAKE_Kanban.Column.Done" },
      },
      columns: [
        {
          id: "col-new",
          name: "New",
          columnType: "incoming",
          isSplit: false,
          stateMappings: {
            Task: "New",
            Bug: "New",
            "User Story": "New",
          },
        },
      ],
    });
  }),

  http.post(`${BASE}/_apis/wit/wiql`, () => {
    return HttpResponse.json(createWiqlResponse([1, 2, 3]));
  }),

  http.post(`${BASE}/_apis/wit/workitemsbatch`, async ({ request }) => {
    const body = await request.json() as { ids?: number[] };
    const ids = (body.ids ?? []).map(Number).filter(Boolean);
    return HttpResponse.json(createBatchResponse(ids));
  }),
];
