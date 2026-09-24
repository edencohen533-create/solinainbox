import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AudiencePreview } from "@/components/campaigns/audience-editor";
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("does not display a late count for a different selected audience", async () => {
  let finish!: (value: unknown) => void;
  vi.stubGlobal("fetch", vi.fn(() => new Promise((resolve) => { finish = resolve; })));
  const view = render(<AudiencePreview listId="first" />);
  fireEvent.click(screen.getByRole("button", { name: "בדוק קהל וזכאות" }));
  view.rerender(<AudiencePreview listId="second" />);
  finish({ ok: true, json: async () => ({ matched: 123, excluded: 0, eligible: 123, ineligible: 0, checkedAt: new Date().toISOString(), samples: [] }) });
  await waitFor(() => expect(screen.getByRole("button", { name: "בדוק קהל וזכאות" })).toBeEnabled());
  expect(screen.queryByText(/123 מתאימים/)).not.toBeInTheDocument();
});
