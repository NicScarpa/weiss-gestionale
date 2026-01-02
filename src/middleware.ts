import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'

// Force Node.js runtime instead of Edge (required for crypto module)
export const runtime = 'nodejs'

// Routes that don't require authentication
const publicRoutes = ['/login']

// Routes that require specific roles
const roleRoutes: Record<string, string[]> = {
  '/impostazioni': ['admin', 'manager'],
}

export default auth((req) => {
  const { pathname } = req.nextUrl
  const isLoggedIn = !!req.auth
  const userRole = req.auth?.user?.role

  // Allow public routes
  if (publicRoutes.some(route => pathname.startsWith(route))) {
    // If logged in and trying to access login, redirect to home
    if (isLoggedIn && pathname === '/login') {
      return NextResponse.redirect(new URL('/', req.nextUrl))
    }
    return NextResponse.next()
  }

  // Allow API and static routes
  if (
    pathname.startsWith('/api') ||
    pathname.startsWith('/_next') ||
    pathname.includes('.')
  ) {
    return NextResponse.next()
  }

  // Redirect to login if not authenticated
  if (!isLoggedIn) {
    const loginUrl = new URL('/login', req.nextUrl)
    loginUrl.searchParams.set('callbackUrl', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Check role-based access
  for (const [route, allowedRoles] of Object.entries(roleRoutes)) {
    if (pathname.startsWith(route)) {
      if (!userRole || !allowedRoles.includes(userRole)) {
        // Redirect to home if not authorized
        return NextResponse.redirect(new URL('/', req.nextUrl))
      }
    }
  }

  return NextResponse.next()
})

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}
