import { z } from "zod";
export const taskStatus = z.enum(["OPEN", "DONE", "CANCELLED"]);
const fields = { title: z.string().trim().min(1).max(200), dueAt: z.iso.datetime({ offset: true }), assignedToId: z.string().min(1).max(200) };
export const createTaskSchema = z.object({ ...fields, contactId: z.string().min(1).max(200), conversationId: z.string().min(1).max(200).nullable().optional(), requestKey: z.uuid() }).strict();
export const updateTaskSchema = z.object({ title: fields.title.optional(), dueAt: fields.dueAt.optional(), assignedToId: fields.assignedToId.optional(), status: taskStatus.optional(), version: z.number().int().min(0) }).strict().refine((input) => Object.keys(input).length > 1, "אין שינוי לשמירה");
export const listTaskSchema = z.object({ contactId: z.string().min(1).max(200), conversationId: z.string().min(1).max(200).optional(), page: z.coerce.number().int().min(1).max(100000).default(1) }).strict();
export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
