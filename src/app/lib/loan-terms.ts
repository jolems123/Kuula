import { Capacitor } from "@capacitor/core";

export const GOOGLE_PLAY_MIN_TERM_DAYS = 61;
const STANDARD_TERM_OPTIONS = [30, 45, 60, 90, 120, 180, 365] as const;

export function getLoanTermOptions(platform = Capacitor.getPlatform()): number[] {
  const options = platform === "android"
    ? [GOOGLE_PLAY_MIN_TERM_DAYS, ...STANDARD_TERM_OPTIONS]
    : [...STANDARD_TERM_OPTIONS];
  return options.filter((days) => platform !== "android" || days >= GOOGLE_PLAY_MIN_TERM_DAYS);
}
