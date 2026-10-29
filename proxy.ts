import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse, type NextRequest, type NextFetchEvent } from 'next/server';

const publicRoute = createRouteMatcher(['/sign-in(.*)', '/sign-up(.*)']);
const retiredRoute = createRouteMatcher(['/api/outreach', '/api/match', '/api/score', '/api/webhooks/(.*)', '/api/cron/(.*)']);
const authenticated = clerkMiddleware(async (auth, req) => {
  if (publicRoute(req)) return;
  const { userId } = await auth();
  if (!userId) {
    if (req.nextUrl.pathname.startsWith('/api/')) {
      return NextResponse.json({error:'Sign in to access your workspace.'},{status:401,headers:{'Cache-Control':'no-store'}});
    }
    return NextResponse.redirect(new URL('/sign-in',req.url));
  }
  // Database-backed workspace membership is checked in every data route.
});

export default function middleware(req:NextRequest,event:NextFetchEvent) {
  if(retiredRoute(req)) return NextResponse.next();
  if(!process.env.CLERK_SECRET_KEY || !process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    return NextResponse.json({error:'Sign-in is not configured. Ask the workspace administrator to finish setup.'},{status:503,headers:{'Cache-Control':'no-store'}});
  }
  return authenticated(req,event);
}
export const config={matcher:['/((?!_next/static|_next/image|favicon.ico).*)']};
