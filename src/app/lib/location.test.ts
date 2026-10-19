import { afterEach, expect, it, vi } from "vitest";
import { captureLocation, pointToPixel, pixelToPoint } from "./location";
afterEach(() => vi.unstubAllGlobals());
function mockLocation(getCurrentPosition: unknown) {
  vi.stubGlobal("window", { isSecureContext: true });
  vi.stubGlobal("document", {});
  vi.stubGlobal("navigator", { geolocation: { getCurrentPosition } });
}
it("round trips map positions including equator, Kampala and longitude wrapping", () => {
  for (const point of [{ latitude: 0, longitude: 0 }, { latitude: 0.3476, longitude: 32.5825 }, { latitude: -34, longitude: -179.9 }]) {
    const pixel = pointToPixel(point, 17);
    const actual = pixelToPoint(pixel.x, pixel.y, 17);
    expect(actual.latitude).toBeCloseTo(point.latitude, 7);
    expect(actual.longitude).toBeCloseTo(point.longitude, 7);
  }
});
it("keeps zero coordinates and capture accuracy", async () => {
  mockLocation((resolve: (result: unknown) => void) => resolve({ coords: { latitude: 0, longitude: 32.5, accuracy: 12.4 } }));
  expect(await captureLocation()).toMatchObject({ latitude: 0, longitude: 32.5, accuracy: 12 });
});
it("does not retry a denied permission", async () => {
  const locate = vi.fn((_resolve, reject) => reject({ code: 1 }));
  mockLocation(locate);
  await expect(captureLocation()).rejects.toThrow(/Allow location/);
  expect(locate).toHaveBeenCalledTimes(1);
});
it("tries a network fix when high accuracy times out", async () => {
  const locate = vi.fn().mockImplementationOnce((_resolve, reject) => reject({ code: 3 })).mockImplementationOnce(resolve => resolve({ coords: { latitude: 0.3, longitude: 32.5, accuracy: 140 } }));
  mockLocation(locate);
  expect((await captureLocation()).accuracy).toBe(140);
  expect(locate.mock.calls[1][2].enableHighAccuracy).toBe(false);
});
it("reports policy and insecure-context blockers before requesting location", async () => {
  const locate = vi.fn(); mockLocation(locate);
  vi.stubGlobal("document", { permissionsPolicy: { allowsFeature: () => false } });
  await expect(captureLocation()).rejects.toThrow(/unavailable on this page/);
  vi.stubGlobal("window", { isSecureContext: false });
  await expect(captureLocation()).rejects.toThrow(/HTTPS/);
  expect(locate).not.toHaveBeenCalled();
});
