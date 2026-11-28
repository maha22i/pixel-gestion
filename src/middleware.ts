import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

const SESSION_COOKIE = "pf_session";
const SESSION_ACTIVITY_COOKIE = "pf_last_seen";
const REMEMBER_COOKIE = "pf_remember";
const OPEN_FILES = ["/manifest.webmanifest", "/sw.js", "/icon-192.png", "/icon-512.png", "/apple-touch-icon.png"];

function envInt(name: string, fallback: number) {
  const n = Number(process.env[name] ?? "");
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

const SESSION_IDLE_SECONDS = envInt("SESSION_IDLE_SECONDS", 30 * 60);

function isPunchPath(pathname: string) {
  return pathname === "/pointer" || pathname.startsWith("/pointer/") || pathname === "/ma-journee" || pathname.startsWith("/ma-journee/");
}

function redirectToLogin(req: NextRequest, reason?: string) {
  const url = req.nextUrl.clone();
  const back = req.nextUrl.pathname + req.nextUrl.search;
  url.pathname = "/login";
  const params = new URLSearchParams();
  if (reason) params.set("e", reason);
  if (back.startsWith("/") && !back.startsWith("//") && !back.includes("://") && !back.startsWith("/login")) params.set("next", back);
  url.search = params.toString() ? `?${params}` : "";
  const res = NextResponse.redirect(url);
  res.cookies.delete(SESSION_COOKIE);
  res.cookies.delete(SESSION_ACTIVITY_COOKIE);
  return res;
}

function forward(req: NextRequest, mode: "session" | "remember") {
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-pf-auth", mode);
  return requestHeaders;
}

function allowRemember(req: NextRequest) {
  const res = NextResponse.next({ request: { headers: forward(req, "remember") } });
  res.cookies.delete(SESSION_COOKIE);
  res.cookies.delete(SESSION_ACTIVITY_COOKIE);
  return res;
}

async function rememberValid(token: string | undefined) {
  if (!token || !process.env.AUTH_SECRET) return false;
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(process.env.AUTH_SECRET));
    return payload.scope === "punch";
  } catch {
    return false;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/login") || pathname.startsWith("/signer") || OPEN_FILES.includes(pathname)) return NextResponse.next();
  const remembered = await rememberValid(req.cookies.get(REMEMBER_COOKIE)?.value);
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (token && process.env.AUTH_SECRET) {
    try {
      await jwtVerify(token, new TextEncoder().encode(process.env.AUTH_SECRET));
      const now = Math.floor(Date.now() / 1000);
      const lastSeenRaw = req.cookies.get(SESSION_ACTIVITY_COOKIE)?.value;
      const lastSeen = Number(lastSeenRaw ?? "");
      const idle = !!(lastSeenRaw && Number.isFinite(lastSeen) && now - lastSeen > SESSION_IDLE_SECONDS);
      if (idle) {
        if (remembered && isPunchPath(pathname)) return allowRemember(req);
        return redirectToLogin(req, remembered ? "module" : "session");
      }
      const res = NextResponse.next({ request: { headers: forward(req, "session") } });
      res.cookies.set(SESSION_ACTIVITY_COOKIE, String(now), {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.COOKIE_SECURE === "true",
        path: "/",
        maxAge: SESSION_IDLE_SECONDS,
      });
      return res;
    } catch { /* jeton expiré */ }
  }
  if (remembered && isPunchPath(pathname)) return allowRemember(req);
  return redirectToLogin(req, remembered ? "module" : undefined);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|logo.png|logo-light.png|logo-transparent.png|logo.jpg|signature.png|fonts/|uploads/).*)"],
};
