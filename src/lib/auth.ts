import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { systemDatabase as prisma } from "@/lib/system-database";
import { organizationSession } from "@/lib/organization-context";

const nextAuth = NextAuth({
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email;
        const password = credentials?.password;
        if (typeof email !== "string" || typeof password !== "string") {
          return null;
        }

        const user = await prisma.user.findUnique({ where: { email }, include: { organization: { select: { isActive: true } } } });
        if (!user || !user.isActive || !user.organization.isActive) {
          return null;
        }

        const isValid = await bcrypt.compare(password, user.passwordHash);
        if (!isValid) {
          return null;
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          teamId: user.teamId,
          organizationId: user.organizationId,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id as string;
        token.role = user.role;
        token.teamId = user.teamId;
        token.authenticatedAt = Date.now();
      }
      if (token.id) {
        const current = await prisma.user.findUnique({ where: { id: token.id }, select: { organization: { select: { isActive: true } }, organizationId: true, role: true, teamId: true, isActive: true, updatedAt: true } });
        if (!current?.isActive || !current.organization.isActive) return null;
        const authenticatedAt = typeof token.authenticatedAt === "number" ? token.authenticatedAt : (token.iat ?? 0) * 1000;
        if (!user && current.updatedAt.getTime() > authenticatedAt) return null;
        token.organizationId = current.organizationId;
        token.role = current.role;
        token.teamId = current.teamId;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.organizationId = token.organizationId;
      session.user.id = token.id;
      session.user.role = token.role;
      session.user.teamId = token.teamId;
      return session;
    },
  },
});

export const { handlers, signIn, signOut } = nextAuth;
export const auth = new Proxy(nextAuth.auth, {
  apply(target, thisArg, args) {
    const cached = args.length === 0 ? organizationSession() : undefined;
    return cached ? Promise.resolve(cached) : Reflect.apply(target, thisArg, args);
  },
});
