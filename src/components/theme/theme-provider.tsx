'use client'

import { ThemeProvider as NextThemesProvider } from 'next-themes'
import type { ComponentProps } from 'react'

/**
 * Provider del tema chiaro/scuro.
 *
 * Va montato come primo figlio di <body>: next-themes emette qui uno script
 * sincrono che scrive la classe sull'elemento <html> prima che il browser
 * dipinga, ed è quello che evita il lampo di tema sbagliato al primo caricamento.
 */
export function ThemeProvider({ children, ...props }: ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      storageKey="weiss-theme"
      {...props}
    >
      {children}
    </NextThemesProvider>
  )
}
