// app/api/check_user/route.ts
import { adminAuth, adminDb } from "@/app/api/firebase-admin";
import { corsJson, corsPreflight } from "../_cors";

export async function OPTIONS(request: Request) {
  return corsPreflight(request);
}

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return corsJson(request, { error: "Missing or invalid token" }, 401);
    }

    const token = authHeader.split("Bearer ")[1];

    // Verify token with Firebase Admin
    const decodedToken = await adminAuth.verifyIdToken(token);
    const uid = decodedToken.uid;

    // Query Firestore collection
    const userDocSnap = await adminDb.collection("users").doc(uid).get();

    if (!userDocSnap.exists) {
      return corsJson(request, { exists: false, message: "User not found" }, 404);
    }

    return corsJson(request, { exists: true, user: userDocSnap.data() }, 200);
  } catch (error: any) {
    return corsJson(request, { error: "Verification failed", details: error.message }, 401);
  }
}
