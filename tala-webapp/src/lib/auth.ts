// src/lib/auth.ts
import { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        username: { label: 'Username', type: 'text' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const validUser = process.env.TALA_USER     ?? 'admin'
        const validPass = process.env.TALA_PASSWORD ?? 'tala2026'

        if (
          credentials?.username === validUser &&
          credentials?.password === validPass
        ) {
          return { id: '1', name: 'TALA Researcher', email: 'tala@feutech.edu.ph' }
        }
        return null
      },
    }),
  ],
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/login',
  },
  callbacks: {
    async redirect({ url, baseUrl }) {
      return url.startsWith(baseUrl) ? url : `${baseUrl}/dashboard`
    },
  },
}
