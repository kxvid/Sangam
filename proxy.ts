import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse, type NextRequest, type NextFetchEvent } from 'next/server';

const publicRoute = createRouteMatcher(['/sign-in(.*)', '/sign-up(.*)']);
const retiredRoute = createRouteMatcher(['/api/outreach', '/api/match', '/api/score', '/api/webhooks/(.*)', '/api/cron/(.*)']);

function configuredAuthorizedParties(): string[] | null {
  const origins = process.env.CLERK_AUTHORIZED_PARTIES?.split(',').map(value => value.trim());
  if (!origins?.length || origins.length > 16) return null;
  for (const origin of origins) {
    try {
      const url = new URL(origin);
      const localDevelopment = process.env.NODE_ENV === 'development'
        && url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
      // Require canonical origins: no paths, credentials, wildcards or URL
      // normalization. Never derive this trust list from request headers.
      if (origin !== url.origin || origin.includes('*') || (url.protocol !== 'https:' && !localDevelopment)) return null;
    } catch {
      return null;
    }
  }
  return [...new Set(origins)];
}

const authenticated = (authorizedParties: string[]) => clerkMiddleware(async (auth, req) => {
  if (publicRoute(req)) return;
  const { userId } = await auth();
  if (!userId) {
    if (req.nextUrl.pathname.startsWith('/api/')) {
      return NextResponse.json({error:'Sign in to access your workspace.'},{status:401,headers:{'Cache-Control':'no-store'}});
    }
    return NextResponse.redirect(new URL('/sign-in',req.url));
  }
  // Database-backed workspace membership is checked in every data route.
}, { authorizedParties });

export default function middleware(req:NextRequest,event:NextFetchEvent) {
  if(retiredRoute(req)) return NextResponse.next();
  const authorizedParties = configuredAuthorizedParties();
  if(!process.env.CLERK_SECRET_KEY || !process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || !authorizedParties) {
    return NextResponse.json({error:'Sign-in is not configured. Ask the workspace administrator to finish setup.'},{status:503,headers:{'Cache-Control':'no-store'}});
  }
  return authenticated(authorizedParties)(req,event);
}
export const config={matcher:['/((?!_next/static|_next/image|favicon.ico).*)']};
