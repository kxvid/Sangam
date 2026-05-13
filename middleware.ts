import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/webhooks/(.*)",
  "/api/cron/(.*)",
]);

const allowedEmails = (process.env.CLERK_ALLOWED_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export default clerkMiddleware(async (auth, req) => {
  if (isPublicRoute(req)) return;

  const { userId, sessionClaims } = await auth();

  if (!userId) {
    const url = req.nextUrl.clone();
    url.pathname = "/sign-in";
    return NextResponse.redirect(url);
  }

  if (allowedEmails.length > 0) {
    const email = (sessionClaims?.email as string | undefined)?.toLowerCase();
    if (!email || !allowedEmails.includes(email)) {
      return new NextResponse("Forbidden — your account is not on the operator allowlist.", {
        status: 403,
      });
    }
  }
});

export const config = {
  matcher: ["/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)", "/", "/(api|trpc)(.*)"],
};
