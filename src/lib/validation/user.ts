import { z } from "zod";
import { Role } from "@prisma/client";

export const createUserSchema = z.object({
  name: z.string().min(1, "נא להזין שם"),
  email: z.email("כתובת אימייל לא תקינה"),
  password: z.string().min(8, "סיסמה חייבת להכיל לפחות 8 תווים"),
  role: z.enum(Role),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
