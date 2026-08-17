import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// NOTA: il controllo del ruolo NON può avvenire qui — il token di sessione è
// JWE e non è decodificabile in edge runtime. I controlli di ruolo vivono
// nelle singole route API (guard admin/manager sulle route finanziarie) e nel
// layout della dashboard (redirect dello staff al portale).

// Rotte pubbliche (non richiedono autenticazione)
const PUBLIC_PREFIXES = [
  '/login',
  '/forgot-password',
  '/reset-password',
  '/api/auth',
  '/invito',
  '/api/staff/invite/complete',
  // Il cron non ha il cookie di sessione: senza questa eccezione verrebbe
  // rediretto a /login prima di arrivare alla route, che si difende da sola
  // con il segreto CRON_SECRET nell'header Authorization.
  '/api/attendance/auto-clockout',
  '/api/promemoria-timbratura/cron',
  '/api/banca/sincronizzazione/cron',
  // Il ritorno dalla banca a fine autenticazione PSD2. Arriva da fuori — dal
  // sito dell'istituto, e spesso dal telefono su cui si è approvato l'OTP,
  // non dal dispositivo dove la sessione è aperta. Protetta, il middleware la
  // manderebbe a /login **perdendo il parametro `ref`**, cioè l'unico dato
  // che porta: quale collegamento ha appena concluso l'autenticazione.
  // La route non legge e non scrive niente, prende `ref` dalla query e
  // redirige al pannello — che ha la sua autorizzazione e manda al login chi
  // deve autenticarsi. Vedi il commento in testa a quel file.
  '/api/gocardless/callback',
  // La pagina «Sei offline» non guarda nessun dato e viene scaricata dal
  // service worker mentre si installa — cioè al primo caricamento, che per
  // tutti avviene su /login, senza sessione. Protetta, in cache finirebbe la
  // pagina di login al posto suo, e senza rete l'applicazione mostrerebbe un
  // form da compilare invece di dire che manca la connessione.
  '/offline',
]

function isPathAllowed(pathname: string, prefixes: string[]) {
  return prefixes.some(prefix => pathname === prefix || pathname.startsWith(prefix + '/'))
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Handle CORS preflight
  if (request.method === 'OPTIONS' && pathname.startsWith('/api/')) {
    const origin = request.headers.get('origin') || ''
    const allowedOrigin = process.env.NEXT_PUBLIC_APP_URL || ''
    return new NextResponse(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': origin === allowedOrigin ? allowedOrigin : '',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400',
      },
    })
  }

  // Rotte pubbliche: accessibili a tutti
  if (isPathAllowed(pathname, PUBLIC_PREFIXES)) {
    return NextResponse.next()
  }

  // Verifica la presenza del session token (NextAuth v5 usa JWE, non JWT plain)
  // La validazione completa (scadenza, claims, mustChangePassword) viene fatta
  // da auth() nelle API routes e dal ForcePasswordChangeModal lato client.
  const sessionToken = request.cookies.get('authjs.session-token')?.value
    || request.cookies.get('__Secure-authjs.session-token')?.value

  // Utente non autenticato su rotta protetta → redirect login
  if (!sessionToken) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('callbackUrl', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Il percorso richiesto non è leggibile dai Server Component: lo passiamo
  // come header così i layout possono decidere in base alla rotta (lo usa
  // `src/app/(auth)/layout.tsx`). Attenzione: NON è un appiglio buono per
  // l'autorizzazione, perché su navigazione lato client i layout condivisi non
  // vengono rieseguiti — le sezioni riservate si separano per gruppo di rotte,
  // vedi il commento in `src/app/(dashboard)/layout.tsx`.
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-pathname', pathname)

  const response = NextResponse.next({ request: { headers: requestHeaders } })
  if (pathname.startsWith('/api/')) {
    const origin = request.headers.get('origin') || ''
    const allowedOrigin = process.env.NEXT_PUBLIC_APP_URL || ''
    if (origin === allowedOrigin) {
      response.headers.set('Access-Control-Allow-Origin', allowedOrigin)
    }
  }
  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|images|icons|manifest|sw\\.js).*)']
}
