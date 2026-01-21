/**
 * Logger strutturato con Pino
 * Sostituisce console.log/error/warn in tutta l'applicazione
 */
import pino from 'pino'

// Configurazione base Pino
const pinoLogger = pino({
  level: process.env.LOG_LEVEL || 'info',
  // In development usa pino-pretty per output leggibile
  ...(process.env.NODE_ENV === 'development' && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss',
        ignore: 'pid,hostname',
      },
    },
  }),
  // In produzione usa JSON per parsing strutturato
  ...(process.env.NODE_ENV === 'production' && {
    formatters: {
      level: (label) => ({ level: label }),
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  }),
})

/**
 * Logger wrapper con metodi tipizzati
 * Integrazione futura con Sentry per error tracking
 */
export const logger = {
  /**
   * Log informativo - operazioni normali
   */
  info: (message: string, data?: Record<string, unknown>) => {
    if (data) {
      pinoLogger.info(data, message)
    } else {
      pinoLogger.info(message)
    }
  },

  /**
   * Log di warning - situazioni anomale ma non critiche
   */
  warn: (message: string, data?: Record<string, unknown>) => {
    if (data) {
      pinoLogger.warn(data, message)
    } else {
      pinoLogger.warn(message)
    }
  },

  /**
   * Log di errore - errori catturati
   * Integrazione Sentry: gli errori vengono anche inviati a Sentry
   */
  error: (message: string, error?: Error | unknown, data?: Record<string, unknown>) => {
    const errorData: Record<string, unknown> = { ...data }

    if (error instanceof Error) {
      errorData.errorName = error.name
      errorData.errorMessage = error.message
      errorData.stack = error.stack
    } else if (error) {
      errorData.error = error
    }

    pinoLogger.error(errorData, message)

    // TODO: Integrare Sentry quando configurato
    // if (process.env.NEXT_PUBLIC_SENTRY_DSN && error instanceof Error) {
    //   Sentry.captureException(error)
    // }
  },

  /**
   * Log di debug - solo in development
   */
  debug: (message: string, data?: Record<string, unknown>) => {
    if (data) {
      pinoLogger.debug(data, message)
    } else {
      pinoLogger.debug(message)
    }
  },

  /**
   * Log fatale - errori critici che richiedono attenzione immediata
   */
  fatal: (message: string, error?: Error, data?: Record<string, unknown>) => {
    const errorData = {
      ...data,
      ...(error && {
        errorName: error.name,
        errorMessage: error.message,
        stack: error.stack,
      }),
    }

    pinoLogger.fatal(errorData, message)
  },

  /**
   * Child logger con contesto aggiuntivo
   * Utile per tracciare richieste specifiche
   */
  child: (bindings: Record<string, unknown>) => {
    const childPino = pinoLogger.child(bindings)
    return {
      info: (message: string, data?: Record<string, unknown>) => {
        if (data) childPino.info(data, message)
        else childPino.info(message)
      },
      warn: (message: string, data?: Record<string, unknown>) => {
        if (data) childPino.warn(data, message)
        else childPino.warn(message)
      },
      error: (message: string, error?: Error | unknown, data?: Record<string, unknown>) => {
        const errorData = {
          ...data,
          ...(error instanceof Error && {
            errorName: error.name,
            errorMessage: error.message,
            stack: error.stack,
          }),
        }
        childPino.error(errorData, message)
      },
      debug: (message: string, data?: Record<string, unknown>) => {
        if (data) childPino.debug(data, message)
        else childPino.debug(message)
      },
    }
  },
}

// Export default per import più semplice
export default logger
