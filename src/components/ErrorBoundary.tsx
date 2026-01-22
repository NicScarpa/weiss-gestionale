'use client'

import React, { Component, ReactNode } from 'react'
import { AlertTriangle, RefreshCw, Home } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'

interface Props {
  children: ReactNode
  fallback?: ReactNode
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void
}

interface State {
  hasError: boolean
  error: Error | null
  errorInfo: React.ErrorInfo | null
}

/**
 * Error Boundary per catturare errori nei componenti React
 * Mostra un fallback UI quando si verifica un errore
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    }
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    this.setState({ errorInfo })

    // Chiama callback se fornito
    this.props.onError?.(error, errorInfo)

    // Log errore (in produzione sarà inviato a Sentry)
    console.error('ErrorBoundary caught an error:', error, errorInfo)
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null, errorInfo: null })
  }

  handleGoHome = (): void => {
    window.location.href = '/'
  }

  render(): ReactNode {
    if (this.state.hasError) {
      // Usa fallback personalizzato se fornito
      if (this.props.fallback) {
        return this.props.fallback
      }

      // Fallback di default
      return (
        <div className="flex min-h-[400px] items-center justify-center p-4">
          <Card className="w-full max-w-md">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
                <AlertTriangle className="h-8 w-8 text-destructive" />
              </div>
              <CardTitle>Si è verificato un errore</CardTitle>
            </CardHeader>
            <CardContent className="text-center text-muted-foreground">
              <p>
                Ci scusiamo per l&apos;inconveniente. Si è verificato un errore
                imprevisto durante il caricamento di questa sezione.
              </p>
              {process.env.NODE_ENV === 'development' && this.state.error && (
                <details className="mt-4 text-left">
                  <summary className="cursor-pointer text-sm font-medium">
                    Dettagli errore (dev only)
                  </summary>
                  <pre className="mt-2 overflow-auto rounded bg-muted p-2 text-xs">
                    {this.state.error.message}
                    {'\n\n'}
                    {this.state.errorInfo?.componentStack}
                  </pre>
                </details>
              )}
            </CardContent>
            <CardFooter className="flex justify-center gap-2">
              <Button variant="outline" onClick={this.handleRetry}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Riprova
              </Button>
              <Button onClick={this.handleGoHome}>
                <Home className="mr-2 h-4 w-4" />
                Torna alla Home
              </Button>
            </CardFooter>
          </Card>
        </div>
      )
    }

    return this.props.children
  }
}

/**
 * HOC per wrappare componenti con ErrorBoundary
 */
export function withErrorBoundary<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  fallback?: ReactNode
): React.FC<P> {
  const displayName = WrappedComponent.displayName || WrappedComponent.name || 'Component'

  const WithErrorBoundary: React.FC<P> = (props) => (
    <ErrorBoundary fallback={fallback}>
      <WrappedComponent {...props} />
    </ErrorBoundary>
  )

  WithErrorBoundary.displayName = `withErrorBoundary(${displayName})`

  return WithErrorBoundary
}

/**
 * Componente per errori specifici delle pagine
 */
export function PageError({
  title = 'Errore di caricamento',
  message = 'Si è verificato un errore durante il caricamento della pagina.',
  onRetry,
}: {
  title?: string
  message?: string
  onRetry?: () => void
}) {
  return (
    <div className="flex min-h-[50vh] items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
            <AlertTriangle className="h-8 w-8 text-destructive" />
          </div>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent className="text-center text-muted-foreground">
          <p>{message}</p>
        </CardContent>
        <CardFooter className="flex justify-center">
          {onRetry && (
            <Button onClick={onRetry}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Riprova
            </Button>
          )}
        </CardFooter>
      </Card>
    </div>
  )
}

/**
 * Componente per errori API
 */
export function ApiError({
  error,
  onRetry,
}: {
  error: { message?: string; code?: string }
  onRetry?: () => void
}) {
  return (
    <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-destructive" />
        <div className="flex-1">
          <p className="font-medium text-destructive">
            {error.message || 'Si è verificato un errore'}
          </p>
          {error.code && (
            <p className="mt-1 text-sm text-muted-foreground">
              Codice errore: {error.code}
            </p>
          )}
        </div>
        {onRetry && (
          <Button size="sm" variant="outline" onClick={onRetry}>
            Riprova
          </Button>
        )}
      </div>
    </div>
  )
}

export default ErrorBoundary
