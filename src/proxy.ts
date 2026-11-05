// Comprobación optimista: sin cookie de sesión → /login.
// La autorización real se hace en cada página, server action y ruta API.
import { NextResponse, type NextRequest } from "next/server"

const COOKIES = ["authjs.session-token", "__Secure-authjs.session-token"]

export function proxy(request: NextRequest) {
  const hasSession = COOKIES.some((c) => request.cookies.has(c))
  if (!hasSession) {
    const url = new URL("/login", request.url)
    return NextResponse.redirect(url)
  }
  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!login|api/auth|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|ico)$).*)"],
}
