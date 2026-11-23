import { NextRequest, NextResponse } from "next/server";
import { auth0 } from "@/lib/auth0";
import { corsHeaders, corsJson } from "./_cors";
import { adminAuth } from "./firebase-admin";

// Routes under app/api are reachable directly over HTTP by anyone who has
// the URL — the Auth0 login screen in the portal UI does NOT protect them.
// Any route that reads/writes admin-only data must call this first and
// return early if it responds with something.
//
// Fails closed: any error while checking the session is treated as
// unauthenticated rather than silently letting the request through.
export async function requireAdminSession(request: NextRequest, methods = "GET, OPTIONS") {
  if (await hasAdminSession(request)) return null; // authenticated — caller should continue
  return NextResponse.json(
    { error: "Unauthorized: admin sign-in required" },
    { status: 401, headers: corsHeaders(request, methods) },
  );
}

// True when the request carries a valid Auth0 admin session cookie.
export async function hasAdminSession(request: NextRequest) {
  try {
    const session = await auth0.getSession(request);
    return !!session?.user;
  } catch (error) {
    console.error("Error checking admin session:", error);
    return false;
  }
}

// Verifies the worker's Firebase ID token from the Authorization header.
// Returns { uid } on success, or { denied } holding the 401 response to send back.
export async function requireWorker(
  request: Request,
): Promise<{ uid: string; denied?: undefined } | { uid?: undefined; denied: NextResponse }> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return { denied: corsJson(request, { error: "Missing or invalid token" }, 401) };
  }
  try {
    const decoded = await adminAuth.verifyIdToken(authHeader.slice("Bearer ".length));
    return { uid: decoded.uid };
  } catch {
    return { denied: corsJson(request, { error: "Invalid or expired token" }, 401) };
  }
}
