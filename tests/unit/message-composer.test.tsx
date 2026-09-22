import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MessageComposer } from "@/components/inbox/message-composer";
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe("message composer", () => {
  it("allows an approved template outside the free-text window and renders the confirmed send", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ templates: [{ id: "t", name: "welcome", body: "שלום {{1}}" }] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ message: { id: "m", body: "שלום דנה" } }) });
    vi.stubGlobal("fetch", fetchMock);
    const onSent = vi.fn();
    render(<MessageComposer conversationId="c" disabled onSent={onSent} />);
    expect(screen.queryByPlaceholderText("הקלד הודעה...")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "שליחת תבנית מאושרת" }));
    await screen.findByRole("option", { name: "welcome" });
    fireEvent.change(screen.getByLabelText("תבנית הודעה"), { target: { value: "t" } });
    fireEvent.change(screen.getByLabelText("משתנה 1"), { target: { value: "דנה" } });
    fireEvent.click(screen.getByRole("button", { name: "שלח" }));
    await waitFor(() => expect(onSent).toHaveBeenCalledWith(expect.objectContaining({ id: "m", body: "שלום דנה" })));
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ templateId: "t", templateVariables: { "1": "דנה" } });
  });
  it("keeps the message text when the provider rejects it", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: "rejected" }) }));
    const onSent = vi.fn();
    render(<MessageComposer conversationId="c" onSent={onSent} />);
    fireEvent.change(screen.getByPlaceholderText("הקלד הודעה..."), { target: { value: "שלום" } });
    fireEvent.click(screen.getByRole("button", { name: "שלח" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "שלח" })).toBeEnabled());
    expect(screen.getByPlaceholderText("הקלד הודעה...")).toHaveValue("שלום");
    expect(onSent).not.toHaveBeenCalled();
  });
});
