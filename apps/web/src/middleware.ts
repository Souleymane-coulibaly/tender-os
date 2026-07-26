import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { APP_SESSION_COOKIE } from "./lib/app-api-client";
import { PLATFORM_SESSION_COOKIE } from "./lib/platform-api-client";

/**
 * Protection de route au niveau Edge — un confort d'UX (redirection rapide), jamais une
 * autorité de sécurité : la présence du cookie n'est pas revalidée ici (pas d'accès à
 * l'API depuis le Middleware), seule l'API elle-même autorise réellement chaque requête
 * (skills/platform-foundation/FRONTEND_PATTERNS.md §25 — "Aucune autorité de sécurité côté client").
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/platform-admin")) {
    if (pathname === "/platform-admin/login") {
      return NextResponse.next();
    }

    const hasPlatformSession = request.cookies.has(PLATFORM_SESSION_COOKIE);
    if (!hasPlatformSession) {
      return NextResponse.redirect(new URL("/platform-admin/login", request.url));
    }

    return NextResponse.next();
  }

  if (pathname.startsWith("/app")) {
    if (pathname === "/app/login") {
      return NextResponse.next();
    }

    const hasAppSession = request.cookies.has(APP_SESSION_COOKIE);
    if (!hasAppSession) {
      return NextResponse.redirect(new URL("/app/login", request.url));
    }

    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/platform-admin/:path*", "/app/:path*"],
};
