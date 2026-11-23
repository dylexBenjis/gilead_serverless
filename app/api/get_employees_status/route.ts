// get employees auth status data from firebase
import { adminAuth, withTimeout } from "../firebase-admin";
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
    const listUsersResult = await withTimeout(adminAuth.listUsers(), 15_000, "Loading sign-in details");
    const authUsers = listUsersResult.users;

    const cleanUsers = authUsers.map((user) => {
      // Destructure out the unwanted fields into ignored variables so the
      // response never contains password hash/salt material.
      const { passwordHash, passwordSalt, ...cleanUser } = user as any;
      return { ...cleanUser };
    });

    return corsJson(request, { employeesStatus: cleanUsers }, 200);
  } catch (error: any) {
    console.error("Error fetching employees status:", error);
    return corsJson(request, { error: "Failed to fetch employees status", details: error?.message }, 503);
  }
}
