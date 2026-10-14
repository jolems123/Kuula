import { afterEach, expect, it, vi } from "vitest";
import { api } from "./client";

afterEach(() => vi.unstubAllGlobals());

it("shares overlapping refresh requests for a single-use token", async () => {
  let finish!: (response: Response) => void;
  const fetchMock = vi.fn(() => new Promise<Response>(resolve => { finish = resolve; }));
  vi.stubGlobal("fetch", fetchMock);
  const first = api.refresh("synthetic-old-refresh-token");
  const second = api.refresh("synthetic-old-refresh-token");
  expect(first).toBe(second);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const payload = { token: "new-access-token", refreshToken: "new-refresh-token", accessExpiresInSeconds: 900 };
  finish(new Response(JSON.stringify(payload), { status: 200 }));
  expect(await first).toEqual(payload);
  expect(await second).toEqual(payload);
});

it("clears a failed in-flight refresh so recovery can retry", async () => {
  const fetchMock = vi.fn().mockRejectedValueOnce(new TypeError("Network unavailable"))
    .mockResolvedValueOnce(new Response(JSON.stringify({ token: "access", refreshToken: "refresh", accessExpiresInSeconds: 900 }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  await expect(api.refresh("synthetic-retry-token")).rejects.toThrow();
  await expect(api.refresh("synthetic-retry-token")).resolves.toMatchObject({ token: "access" });
  expect(fetchMock).toHaveBeenCalledTimes(2);
});
