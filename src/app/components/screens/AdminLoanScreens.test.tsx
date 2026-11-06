import { beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const fixture = vi.hoisted(() => ({ applications: [] as Array<Record<string, unknown>> }));
// Seed the loaded list while keeping real React rendering/hooks. No production
// session, API calls, credit decisions or financial actions are involved.
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, useState: ((initial: unknown) => actual.useState(
    Array.isArray(initial) ? fixture.applications : initial === true ? false : initial,
  )) as typeof actual.useState };
});
vi.mock("../../context/AppContext", () => ({ useAppContext: () => ({ state: { session: { token: "test-only" } } }) }));
vi.mock("../../api/client", () => ({ api: {} }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (value: string) => value }) }));
vi.mock("../AdminLayout", async () => {
  const { createElement } = await import("react");
  const wrapper = ({ children }: { children?: import("react").ReactNode }) => createElement("div", null, children);
  return {
    AdminLayout: wrapper, AdminCard: wrapper, StatCard: wrapper,
    AdminPageHeader: ({ title, subtitle }: { title: string; subtitle: string }) => createElement("header", null, createElement("h1", null, title), createElement("p", null, subtitle)),
    StatusBadge: ({ status }: { status: string }) => createElement("span", null, status),
    AdminTable: ({ rows }: { rows: import("react").ReactNode[][] }) => createElement("div", null,
      rows.map((row, index) => createElement("div", { key: index }, row))),
  };
});
import { AdminLoanAppsListScreen } from "./AdminLoanScreens";

beforeEach(() => { fixture.applications = []; });
it("renders a populated application list without crashing after data loads", () => {
  fixture.applications = [{
    id: "render-regression", applicantName: "Regression Applicant", amount: 50000,
    purpose: "Working capital", status: "pending", createdAt: "2026-11-06T00:00:00Z",
    businessProfile: { businessName: "Regression Shop", sector: "Retail" },
    businessReviewStatus: "pending",
  }];
  const html = renderToStaticMarkup(<AdminLoanAppsListScreen onNavigate={() => {}} />);
  expect(html).toContain("Regression Applicant");
  expect(html).toContain("Regression Shop");
  expect(html).toContain("Review business");
  expect(html).toContain("1 total");
});
it("renders the empty application state", () => {
  const html = renderToStaticMarkup(<AdminLoanAppsListScreen onNavigate={() => {}} />);
  expect(html).toContain("applications yet");
  expect(html).not.toContain("Regression Applicant");
});
