import type { Role } from "@prisma/client";
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
      teamId: string | null;
    } & DefaultSession["user"];
  }

  interface User {
    role: Role;
    teamId: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: Role;
    teamId: string | null;
  }
}

// The beta version of next-auth re-exports its config/callback types from
// @auth/core, which resolves JWT from its own "@auth/core/jwt" module rather
// than "next-auth/jwt" — augment both so the `token` param is typed correctly
// in every callback signature.
declare module "@auth/core/jwt" {
  interface JWT {
    id: string;
    role: Role;
    teamId: string | null;
  }
}
