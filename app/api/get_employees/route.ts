// get employees data from firebase
import { adminDb, withTimeout } from "../firebase-admin";
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
    const employeesSnapshot = await withTimeout(adminDb.collection("users").get(), 15_000, "Loading workers");
    const employees = employeesSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

    return corsJson(request, { employees }, 200);
  } catch (error: any) {
    console.error("Error fetching employees:", error);
    return corsJson(request, { error: "Failed to fetch employees", details: error?.message }, 503);
  }
}
