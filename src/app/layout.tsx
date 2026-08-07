import type { Metadata, Viewport } from 'next'
import { Public_Sans } from 'next/font/google'
import './globals.css'
import { Providers } from '@/components/providers'
import { ThemeProvider } from '@/components/theme/theme-provider'
import { ServiceWorkerRegistration } from '@/components/pwa/ServiceWorkerRegistration'

const publicSans = Public_Sans({
  variable: '--font-public-sans',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: {
    default: 'Weiss Cafè Gestionale',
    template: '%s | Weiss Cafè'
  },
  description: 'Sistema gestionale per Weiss Cafè - Contabilità e controllo di gestione',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Weiss Cafè',
  },
  formatDetection: {
    telephone: false,
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#0f172a' },
    { media: '(prefers-color-scheme: dark)', color: '#171717' },
  ],
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="it" suppressHydrationWarning>
      <body className={`${publicSans.variable} font-sans antialiased`} suppressHydrationWarning>
        <ThemeProvider>
          <Providers>
            {children}
          </Providers>
          <ServiceWorkerRegistration />
        </ThemeProvider>
      </body>
    </html>
  )
}
