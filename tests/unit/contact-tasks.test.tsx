import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ContactTasks } from "@/components/contacts/contact-tasks";
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("retains the same creation key and input after an uncertain response, then clears after confirmed save", async () => {
  const posts: Record<string, unknown>[] = [];
  const fetcher = vi.fn(async (_url: string, options?: RequestInit) => {
    if (options?.method === "POST") {
      posts.push(JSON.parse(String(options.body)));
      if (posts.length === 1) throw new Error("network timeout");
      return { ok: true, json: async () => ({ task: { id: "task" } }) };
    }
    return { ok: true, json: async () => ({ tasks: [], assignees: [{ id: "agent", name: "Agent" }], page: 1, total: 0 }) };
  }); vi.stubGlobal("fetch", fetcher);
  const { container } = render(<ContactTasks contactId="contact" conversationId="conv" userId="agent" />);
  const details = container.querySelector("details")!; details.open = true; fireEvent(details, new Event("toggle", { bubbles: true }));
  await screen.findByLabelText("משימה חדשה");
  fireEvent.change(screen.getByLabelText("משימה חדשה"), { target: { value: "Follow up" } });
  fireEvent.change(screen.getByLabelText("מועד יעד למשימה חדשה"), { target: { value: "2026-10-01T10:00" } });
  fireEvent.click(screen.getByRole("button", { name: "צור משימת מעקב" }));
  await screen.findByRole("alert"); expect(screen.getByLabelText("משימה חדשה")).toHaveValue("Follow up");
  fireEvent.click(screen.getByRole("button", { name: "צור משימת מעקב" }));
  await waitFor(() => expect(screen.getByLabelText("משימה חדשה")).toHaveValue(""));
  expect(posts).toHaveLength(2); expect(posts[0]).toEqual(posts[1]); expect(posts[0].requestKey).toEqual(expect.any(String));
});
