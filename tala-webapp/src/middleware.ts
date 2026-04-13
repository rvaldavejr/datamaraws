import { withAuth } from "next-auth/middleware"

// withAuth explicitly returns the middleware function Next.js is looking for
export default withAuth({
  pages: {
    signIn: "/login", // This ensures unauthenticated users are routed here
  },
})

export const config = {
  matcher: ['/dashboard/:path*'],
}