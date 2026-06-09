// Tests for the #5 (M2) write client (putSave / deleteSave / putIssueRead). These assert the
// client hits the right method + URL and parses the contract shapes (SaveState, IssueReadState).

import { afterEach, describe, expect, it, vi } from "vitest";
import { deleteSave, putIssueRead, putSave } from "./client";
import type { IssueReadState, SaveState } from "../types";

function mockJson(payload: unknown) {
  const fn = vi.fn(
    (...args: unknown[]): Promise<Response> => {
      void args;
      return Promise.resolve(new Response(JSON.stringify(payload), { status: 200 }));
    },
  );
  vi.stubGlobal("fetch", fn);
  return fn;
}

/** First-call [url, init] the mocked fetch was invoked with. */
function calledWith(fn: ReturnType<typeof mockJson>): { url: string; method: string } {
  const call = fn.mock.calls[0];
  const url = String(call?.[0]);
  const init = call?.[1] as { method?: string } | undefined;
  return { url, method: init?.method ?? "GET" };
}

afterEach(() => {
  vi.restoreAllMocks();
});

const CID = "91b6b997-fe16-4e09-b07c-4119ceaaf241";
const IID = "5e5e6fe1-051c-475e-91c6-f0e941eb1509";

describe("putSave", () => {
  it("PUTs /saves/{id} and parses SaveState {content_id, starred:true}", async () => {
    const payload: SaveState = { content_id: CID, starred: true };
    const fetchFn = mockJson(payload);
    const state = await putSave(CID);
    const { url, method } = calledWith(fetchFn);
    expect(method).toBe("PUT");
    expect(url).toContain(`/saves/${CID}`);
    expect(state).toEqual(payload);
    expect(state.starred).toBe(true);
  });
});

describe("deleteSave", () => {
  it("DELETEs /saves/{id} and parses SaveState {content_id, starred:false}", async () => {
    const payload: SaveState = { content_id: CID, starred: false };
    const fetchFn = mockJson(payload);
    const state = await deleteSave(CID);
    const { url, method } = calledWith(fetchFn);
    expect(method).toBe("DELETE");
    expect(url).toContain(`/saves/${CID}`);
    expect(state.starred).toBe(false);
  });
});

describe("putIssueRead", () => {
  it("PUTs /issues/{id}/read and parses IssueReadState {issue_id, read_state:'read'}", async () => {
    const payload: IssueReadState = { issue_id: IID, read_state: "read" };
    const fetchFn = mockJson(payload);
    const state = await putIssueRead(IID);
    const { url, method } = calledWith(fetchFn);
    expect(method).toBe("PUT");
    expect(url).toContain(`/issues/${IID}/read`);
    expect(state.read_state).toBe("read");
  });
});
