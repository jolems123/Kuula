/**
 * i18n — internationalisation for Kuula Mobile.
 *
 * Supported languages (Uganda market):
 *   en  – English (default)
 *   lg  – Luganda (Central)
 *   sw  – Swahili
 *   nyo – Runyankole-Rukiga
 *   xog – Lusoga
 *   ach – Acholi
 *   lgg – Lugbara
 *   teo – Ateso
 *   rnd – Lunyankole
 *   cgg – Rukiga
 *   kon – Lukonzo
 */
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import en from "./locales/en.json";
import lg from "./locales/lg.json";
import sw from "./locales/sw.json";

export const APP_LANGUAGES = [
  { code: "en", label: "English", native: "English" },
  { code: "lg", label: "Luganda", native: "Oluganda" },
  { code: "sw", label: "Swahili", native: "Kiswahili" },
  { code: "nyo", label: "Runyankole-Rukiga", native: "Runyankole-Rukiga" },
  { code: "xog", label: "Lusoga", native: "Olusoga" },
  { code: "ach", label: "Acholi", native: "Leb Acholi" },
  { code: "lgg", label: "Lugbara", native: "Lugbara" },
  { code: "teo", label: "Ateso", native: "Ateso" },
  { code: "kon", label: "Lukonzo", native: "OluKonzo" },
] as const;

export type LanguageCode = (typeof APP_LANGUAGES)[number]["code"];

/** Languages with full translation files bundled */
export const BUNDLED_LANGS: LanguageCode[] = ["en", "lg", "sw"];

/** Languages that fall back to English (translation files added later) */
export const FALLBACK_LANGS: LanguageCode[] = APP_LANGUAGES
  .map((l) => l.code)
  .filter((c) => !BUNDLED_LANGS.includes(c as LanguageCode)) as LanguageCode[];

// Load only bundled translations; others fall back to English.
const resources: Record<string, { translation: typeof en }> = { en: { translation: en } };
if (BUNDLED_LANGS.includes("lg")) resources.lg = { translation: lg as unknown as typeof en };
if (BUNDLED_LANGS.includes("sw")) resources.sw = { translation: sw as unknown as typeof en };

const DETECTED_KEY = "kuula_lang";

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: "en",
    supportedLngs: APP_LANGUAGES.map((l) => l.code),
    detection: {
      // Only use our custom localStorage key — ignore navigator language
      // so the app doesn't auto-switch when the device OS is in English
      // but the user previously picked Luganda.
      order: ["localStorage", "navigator"],
      lookupLocalStorage: DETECTED_KEY,
      caches: ["localStorage"],
    },
    interpolation: {
      escapeValue: false, // React already escapes
    },
    react: {
      useSuspense: false, // Avoid Suspense boundary issues with lazy screens
    },
  });

export default i18n;
export { DETECTED_KEY };