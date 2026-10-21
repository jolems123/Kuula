import { afterEach, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import i18n, { BUNDLED_LANGS } from "./index";
import catalog from "./source-ui.json";
import { UiText, uiText, uiLocale } from "./ui-text";
afterEach(async () => { await i18n.changeLanguage("en"); });
it("ships matching English, Luganda and Swahili UI catalogues with intact interpolation", () => {
  expect(BUNDLED_LANGS).toEqual(["en", "lg", "sw"]);
  for (const source of Object.keys(catalog.en)) for (const lang of ["lg", "sw"] as const) {
    const value = (catalog[lang] as Record<string,string>)[source];
    expect(value, `${lang}: ${source}`).toBeTruthy();
    expect([...value.matchAll(/\{\{([^}]+)\}\}/g)].map(match=>match[1]).sort()).toEqual([...source.matchAll(/\{\{([^}]+)\}\}/g)].map(match=>match[1]).sort());
  }
});
it("changes screens, field errors and display purposes while preserving data and custom descriptions", async () => {
  await i18n.changeLanguage("sw");
  expect(uiText("Your loan application guide")).toBe("Mwongozo wako wa kuomba mkopo");
  expect(uiText("Business or trading name: enter 1–120 characters.")).toContain("herufi 1–120");
  expect(uiText("3 checks still need attention.")).toContain("Ukaguzi 3");
  expect(uiText("Business: Stock and inventory; Other - Home")).toContain("Bidhaa za kuuza");
  expect(uiText("Business: Stock and inventory; Other - Home")).toMatch(/Home$/);
  const html = renderToStaticMarkup(<><input value="Home" readOnly /><select defaultValue="Working capital"><option value="Working capital"><UiText text="Working capital" /></option></select><span>Home</span></>);
  expect(html).toContain('value="Working capital"');
  expect(html).toContain("Mtaji wa uendeshaji");
  expect(html).toContain('value="Home"');
  expect(html).toContain("<span>Home</span>");
  expect(uiLocale()).toBe("sw-UG");
  await i18n.changeLanguage("lg");
  expect(uiText("Your loan application guide")).toBe("Ennungamya y'okusaba ebbanja");
  await i18n.changeLanguage("en");
  expect(uiText("Business: Other - Home")).toBe("Business: Other - Home");
});
