import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { TeamManager } from "@/components/settings/team-manager";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("submits the team form with a button click and keeps failed input for retry", async () => {
  const request = vi.fn().mockResolvedValue({ ok: false }); vi.stubGlobal("fetch", request);
  render(<TeamManager />);
  fireEvent.change(screen.getByLabelText("שם צוות חדש"), { target: { value: "שירות" } });
  fireEvent.click(screen.getByRole("button", { name: "צור צוות" }));
  await waitFor(() => expect(request).toHaveBeenCalledWith("/api/settings/teams", expect.objectContaining({ method: "POST", body: JSON.stringify({ name: "שירות" }) })));
  expect(screen.getByLabelText("שם צוות חדש")).toHaveValue("שירות");
});
