import { NextResponse } from "next/server";

// Centralised CORS handling for all API routes.
//
// The admin dashboard, the web build of the worker app, and the packaged
// Capacitor app (which uses origins like `capacitor://localhost` or
// `http://localhost` on Android/iOS) all need to call these endpoints, so we
// reflect whatever Origin the browser/webview sends instead of hardcoding a
// single allowed origin. This is safe here because none of these endpoints
// rely on browser cookies for auth — auth is done via a bearer token
// (Firebase ID token) that the caller must explicitly attach.
export function corsHeaders(request?: Request, methods?: string) {
  const origin = request?.headers.get("origin") ?? "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    Vary: "Origin",
  };
}

export function corsJson(request: Request, data: any, status = 200, methods?: string) {
  return NextResponse.json(data, { status, headers: corsHeaders(request, methods) });
}

export function corsPreflight(request: Request, methods?: string) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request, methods) });
}
