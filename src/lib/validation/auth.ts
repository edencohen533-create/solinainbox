import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().min(1, "נא להזין אימייל").email("כתובת אימייל לא תקינה"),
  password: z.string().min(1, "נא להזין סיסמה"),
});

export type LoginInput = z.infer<typeof loginSchema>;
