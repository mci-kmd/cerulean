import { http, HttpResponse } from "msw";
import { createWiqlResponse, createBatchResponse } from "../fixtures/ado-responses";

const BASE = "https://dev.azure.com/test-org/test-project";

export const handlers = [
  http.post(`${BASE}/_apis/wit/wiql`, () => {
    return HttpResponse.json(createWiqlResponse([1, 2, 3]));
  }),

  http.get(`${BASE}/_apis/wit/workitems`, ({ request }) => {
    const url = new URL(request.url);
    const ids = (url.searchParams.get("ids") ?? "")
      .split(",")
      .map(Number)
      .filter(Boolean);
    return HttpResponse.json(createBatchResponse(ids));
  }),
];
