// get online/offline presence data from firebase realtime database
import { adminRTDB, withTimeout } from "../firebase-admin";
import { NextRequest } from "next/server";
import { corsJson, corsPreflight } from "../_cors";
import { requireAdminSession } from "../_auth";

export async function OPTIONS(request: NextRequest) {
  return corsPreflight(request);
}

export async function GET(request: NextRequest) {
  const denied = await requireAdminSession(request);
  if (denied) return denied;

  try {
    const snapshot = await withTimeout(adminRTDB.ref("user_Status").once("value"), 15_000, "Loading online status");
    const userStatusData = snapshot.val() || {};

    const onlineUsers = Object.entries(userStatusData).map(([uid, data]: [string, any]) => {
      let userStatus = "";
      let lastChanged: number | null = null;

      if (typeof data === "string") {
        userStatus = data; // { "uid": "online" }
      } else if (data && typeof data === "object") {
        userStatus = data.state; // { "uid": { "state": "online" } }
        lastChanged = data.last_changed ?? null;
      }

      return { userId: uid, status: userStatus, last_changed: lastChanged };
    });

    return corsJson(request, { employeesOnlineStatus: onlineUsers }, 200);
  } catch (error: any) {
    console.error("Error fetching online status:", error);
    return corsJson(request, { error: "Failed to fetch online status", details: error?.message }, 503);
  }
}
