import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ContactConsentEditor } from "@/components/contacts/contact-consent-editor";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("preserves consent provenance when only the full-block flag changes", async () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true }); vi.stubGlobal("fetch", fetchMock);
  render(<ContactConsentEditor contactId="contact" initialStatus="OPTED_IN" initialBlocked={false} />);
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: "שמור הסכמה" }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ isBlocked: true });
});
