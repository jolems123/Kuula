import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import i18n from "./index";
import { parseBusinessLoanPurposes } from "../app/lib/business-loan-purpose";

/** Translate UI copy only. Account data, input values and API enums stay intact. */
export function uiText(source: string, values?: Record<string, string | number>): string {
  const text = source.trim();
  if (!text) return source;
  if (i18n.resolvedLanguage === "en" && !values) return source;
  if (text.startsWith("Business: ")) {
    const purpose = parseBusinessLoanPurposes(text);
    if (purpose) return uiText("Business") + ": " + purpose.options.map(option => option === "Other" ? uiText("Other business purpose") + ": " + purpose.otherDetails : uiText(option)).join("; ");
  }
  if (!values) {
    const missing = /^(.+): enter 1–(\d+) characters\.$/.exec(text);
    if (missing) return uiText("{{label}}: enter 1–{{max}} characters.", { label: uiText(missing[1]), max: missing[2] });
    const remaining = /^(\d+) checks still need attention\.$/.exec(text);
    if (remaining) return uiText("{{count}} checks still need attention.", { count: remaining[1] });
    const allocation = /^Allocate exactly UGX ([\d,]+) across the five categories\. Put 0 in unused categories; do not repeat the full loan in each box\.$/.exec(text);
    if (allocation) return uiText("Allocate exactly UGX {{amount}} across the five categories. Put 0 in unused categories; do not repeat the full loan in each box.", { amount: allocation[1] });
    const balance = /^(Unallocated|Overallocated): (.+)$/.exec(text);
    if (balance) return uiText(`${balance[1]}: {{amount}}`, { amount: balance[2] });
    const item = /^(Expenditure item|Remove item) (\d+)$/.exec(text);
    if (item) return uiText(`${item[1]} {{number}}`, { number: item[2] });
    const toggle = /^(Enable|Disable) (.+)$/.exec(text);
    if (toggle) return uiText(toggle[1]) + " " + uiText(toggle[2]);
    const remove = /^Remove (bank|mobile money) statement$/.exec(text);
    if (remove) return uiText("Remove {{statement}}", { statement: uiText(remove[1] === "bank" ? "Bank statement" : "Mobile money statement") });
    const language = /^Language: (.+)\. Change language$/.exec(text);
    if (language) return uiText("Language: {{language}}. Change language", { language: language[1] });
  }
  const translated = i18n.t(text, { ns: "ui", keySeparator: false, nsSeparator: false, defaultValue: text, ...values });
  return source.slice(0, source.length - source.trimStart().length) + translated + source.slice(source.trimEnd().length);
}
export function UiText({ text }: { text: ReactNode }) {
  useTranslation("ui");
  return <>{typeof text === "string" ? uiText(text) : text}</>;
}

export function uiLocale(): string {
  return `${i18n.resolvedLanguage || "en"}-UG`;
}
