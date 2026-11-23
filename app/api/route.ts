import { corsJson, corsPreflight } from "./_cors";

export async function OPTIONS(request: Request) {
  return corsPreflight(request);
}

export async function GET(request: Request) {
  return corsJson(request, { message: "Gilead admin API is running" });
}
