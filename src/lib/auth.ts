import bcrypt from "bcryptjs"
import NextAuth, { CredentialsSignin } from "next-auth"
import Credentials from "next-auth/providers/credentials"
import { z } from "zod"
import { prisma } from "@/lib/prisma"

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

/** Cambio de usuario sin contraseña para probar roles. Nunca en producción. */
export const devLoginEnabled = process.env.NODE_ENV !== "production" && process.env.ENABLE_DEV_LOGIN === "true"

const devProvider = Credentials({
  id: "dev",
  name: "Desarrollo",
  credentials: { userId: {} },
  async authorize(raw) {
    if (!devLoginEnabled) throw new CredentialsSignin()
    const user = await prisma.user.findUnique({ where: { id: String(raw.userId ?? "") } })
    if (!user || user.status !== "ACTIVE") throw new CredentialsSignin()
    return { id: user.id, email: user.email, name: user.name }
  },
})

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 14 },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(raw) {
        const parsed = loginSchema.safeParse(raw)
        if (!parsed.success) throw new CredentialsSignin()
        const user = await prisma.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } })
        if (!user || user.status !== "ACTIVE") throw new CredentialsSignin()
        const ok = await bcrypt.compare(parsed.data.password, user.passwordHash)
        if (!ok) throw new CredentialsSignin()
        await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
        return { id: user.id, email: user.email, name: user.name }
      },
    }),
    ...(devLoginEnabled ? [devProvider] : []),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) token.uid = user.id
      return token
    },
    session({ session, token }) {
      if (token.uid) session.user.id = token.uid as string
      return session
    },
  },
})
