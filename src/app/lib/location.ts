export interface LocationPoint { latitude: number; longitude: number }
export interface CapturedLocation extends LocationPoint { accuracy: number; capturedAt: string }

export function locationErrorMessage(error: unknown): string {
  const code = (error as { code?: number })?.code;
  if (code === 1) return "Location access is blocked. Allow location for this app in your browser or phone settings, then try again. You can also place the business pin manually.";
  if (code === 2) return "Your device could not find its location. Turn on location services and try near a window or outdoors, or place the pin manually.";
  if (code === 3) return "Finding your location took too long. Try again near a window or outdoors, or place the pin manually.";
  return error instanceof Error ? error.message : "Location could not be captured. You can place the business pin manually.";
}

/** One user-initiated fix; never watches or tracks location in the background. */
export async function captureLocation(): Promise<CapturedLocation> {
  if (!window.isSecureContext) throw new Error("Location needs a secure connection. Open the app using HTTPS, or place the pin manually.");
  const policy = (document as Document & { permissionsPolicy?: { allowsFeature(name: string): boolean }; featurePolicy?: { allowsFeature(name: string): boolean } });
  if ((policy.permissionsPolicy ?? policy.featurePolicy)?.allowsFeature("geolocation") === false) {
    throw new Error("Location access is unavailable on this page. Open the app directly in your browser, or place the pin manually.");
  }
  if (!navigator.geolocation) throw new Error("This device does not support location capture. Place the pin manually instead.");
  const locate = (highAccuracy: boolean) => new Promise<GeolocationPosition>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: highAccuracy, timeout: highAccuracy ? 15000 : 10000, maximumAge: 0 });
  });
  try {
    let result: GeolocationPosition;
    try { result = await locate(true); }
    catch (error) {
      if (![2, 3].includes((error as GeolocationPositionError).code)) throw error;
      result = await locate(false);
    }
    const { latitude, longitude, accuracy } = result.coords;
    if (!Number.isFinite(latitude) || Math.abs(latitude) > 90 || !Number.isFinite(longitude) || Math.abs(longitude) > 180 || !Number.isFinite(accuracy) || accuracy < 0) throw new Error("Your device returned an invalid location. Try again or place the pin manually.");
    return { latitude, longitude, accuracy: Math.round(accuracy), capturedAt: new Date().toISOString() };
  } catch (error) { throw new Error(locationErrorMessage(error)); }
}

const MAX_LATITUDE = 85.05112878;
export function pointToPixel(point: LocationPoint, zoom: number) {
  const scale = 256 * 2 ** zoom;
  const latitude = Math.max(-MAX_LATITUDE, Math.min(MAX_LATITUDE, point.latitude)) * Math.PI / 180;
  return { x: (point.longitude + 180) / 360 * scale, y: (1 - Math.log(Math.tan(latitude) + 1 / Math.cos(latitude)) / Math.PI) / 2 * scale };
}
export function pixelToPoint(x: number, y: number, zoom: number): LocationPoint {
  const scale = 256 * 2 ** zoom;
  return { longitude: ((x / scale * 360) % 360 + 360) % 360 - 180, latitude: Math.atan(Math.sinh(Math.PI * (1 - 2 * Math.max(0, Math.min(scale, y)) / scale))) * 180 / Math.PI };
}
