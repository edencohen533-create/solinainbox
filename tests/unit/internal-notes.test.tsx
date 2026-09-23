import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { InternalNotes } from "@/components/inbox/internal-notes";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("submits an internal note through the note endpoint and clears it after success", async () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true }); vi.stubGlobal("fetch", fetchMock);
  render(<InternalNotes conversationId="c" notes={[]} />);
  fireEvent.click(screen.getByText(/הערות פנימיות לצוות/));
  fireEvent.change(screen.getByLabelText("הערה פנימית לצוות"), { target: { value: "private note" } });
  fireEvent.click(screen.getByRole("button", { name: "שמור הערה" }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/conversations/c/notes", expect.objectContaining({ method: "POST", body: JSON.stringify({ body: "private note" }) })));
  await waitFor(() => expect(screen.getByLabelText("הערה פנימית לצוות")).toHaveValue(""));
});
