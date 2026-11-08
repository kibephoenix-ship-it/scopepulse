import { NextResponse } from "next/server";
import { createClient } from "../../../utils/supabase/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const requestedNext = requestUrl.searchParams.get("next") ?? "/";
  let destination = new URL("/", requestUrl.origin);
  if (
    requestedNext.startsWith("/") &&
    !requestedNext.startsWith("//") &&
    !requestedNext.includes("\\")
  ) {
    try {
      const nextUrl = new URL(requestedNext, requestUrl.origin);
      if (nextUrl.origin === requestUrl.origin) destination = nextUrl;
    } catch {
      // Invalid redirect paths fall back to the app home page.
    }
  }
  const code = requestUrl.searchParams.get("code");

  if (code) {
    try {
      const supabase = await createClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) return NextResponse.redirect(destination);
      console.error("Could not exchange OAuth code:", error.message);
    } catch (error) {
      console.error("OAuth callback failed:", error);
    }
  }

  const errorDestination = new URL("/", requestUrl.origin);
  errorDestination.searchParams.set("error", "oauth");
  return NextResponse.redirect(errorDestination);
}
