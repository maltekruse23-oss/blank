// Tells the root layout the language of the page (from the address, app/ui/i18n.ts), so <html lang>,
// title and footer are right before any script runs. Nothing else is read or kept.
import { NextResponse, type NextRequest } from 'next/server';
import { langOf } from './app/ui/lang';

export function proxy(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set('x-site-lang', langOf(request.nextUrl.pathname));
  return NextResponse.next({ request: { headers } });
}

// Pages only: not the API, scripts, fonts, images or downloads.
export const config = { matcher: ['/((?!api/|_next/|assets/|fonts/|grades/|ranks/|downloads/|favicon|riot\\.txt|example-).*)'] };
