/** Validate officer evaluation/evidence coordinates without dropping zero. */
export function parseVisitCoordinates(latitude: unknown, longitude: unknown) {
  const coordinate = (value: unknown, label: string, limit: number): number | null => {
    if (value == null || value === "" || typeof value === "string" && !value.trim()) return null;
    if (typeof value !== "number" && typeof value !== "string") throw new RangeError(`${label} is invalid`);
    const number = Number(value);
    if (!Number.isFinite(number) || Math.abs(number) > limit) throw new RangeError(`${label} is outside its valid range`);
    return number;
  };
  const gpsLatitude = coordinate(latitude, "Visit latitude", 90);
  const gpsLongitude = coordinate(longitude, "Visit longitude", 180);
  if ((gpsLatitude === null) !== (gpsLongitude === null)) throw new RangeError("Both visit location coordinates are required");
  return { gpsLatitude, gpsLongitude };
}
