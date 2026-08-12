import { NextRequest } from 'next/server'

/**
 * Invocazione diretta degli handler delle route App Router.
 *
 * Non si alza un server: gli handler sono funzioni che prendono una
 * `NextRequest` e restituiscono una `Response`, e chiamarle direttamente
 * esercita esattamente il codice che gira in produzione senza il costo (e la
 * flakiness) di una porta HTTP. Nessuna route del progetto usa `next/headers`,
 * quindi non serve un contesto di richiesta simulato.
 */

const BASE_URL = 'http://localhost:3000'

export interface JsonRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  headers?: Record<string, string>
  /** Query string, aggiunta all'URL. */
  searchParams?: Record<string, string | number | boolean | undefined>
}

/**
 * Costruisce una `NextRequest` con corpo JSON. `url` può essere relativa
 * (`/api/chiusure`) o assoluta.
 */
export function jsonRequest(url: string, options: JsonRequestOptions = {}): NextRequest {
  const { method = 'GET', body, headers = {}, searchParams } = options

  const absolute = new URL(url, BASE_URL)
  if (searchParams) {
    for (const [key, value] of Object.entries(searchParams)) {
      if (value !== undefined) absolute.searchParams.set(key, String(value))
    }
  }

  const hasBody = body !== undefined && method !== 'GET'

  return new NextRequest(absolute, {
    method,
    headers: {
      ...(hasBody ? { 'content-type': 'application/json' } : {}),
      ...headers,
    },
    ...(hasBody ? { body: JSON.stringify(body) } : {}),
  })
}

/** Esito di una chiamata a una route: stato HTTP e corpo già decodificato. */
export interface RouteResponse<T = unknown> {
  status: number
  body: T
  headers: Headers
}

type RouteHandler<P> = (
  request: NextRequest,
  context: { params: Promise<P> }
) => Promise<Response> | Response

/**
 * Chiama un handler di route e ne decodifica la risposta. I parametri di rotta
 * si passano come oggetto semplice: nell'App Router arrivano come Promise, e ci
 * pensa questa funzione ad avvolgerli.
 *
 * Sui due parametri di tipo, e perché il default di `P` è quello che è.
 * TypeScript non inferisce a metà: se il chiamante scrive il tipo del corpo
 * (`callRoute<{ error?: string }>(…)`), `P` non viene più dedotto dai `params`
 * ma cade sul default. Il default vale quindi solo per le route statiche, e
 * `Record<string, never>` è la loro forma esatta — la stessa `EmptyParams` di
 * `withAuth`. Il vecchio default `Record<string, string>` prometteva chiavi
 * qualsiasi e non era assegnabile né a `EmptyParams` né a un `{ id: string }`:
 * a compilatore acceso, cinquanta chiamate su sessanta non passavano.
 *
 * Chi chiama una route dinamica e vuole anche tipare il corpo scrive entrambi:
 * `callRoute<{ error?: string }, { id: string }>(handler, req, { id })`. Chi
 * non tipa il corpo continua a non scrivere nulla: lì `P` si deduce dai
 * `params` come prima.
 */
export async function callRoute<T = unknown, P extends Record<string, string> = Record<string, never>>(
  handler: RouteHandler<P>,
  request: NextRequest,
  params: P = {} as P
): Promise<RouteResponse<T>> {
  const response = await handler(request, { params: Promise.resolve(params) })

  const contentType = response.headers.get('content-type') ?? ''
  let body: unknown = null

  if (contentType.includes('application/json')) {
    body = await response.json()
  } else {
    const text = await response.text()
    body = text.length > 0 ? text : null
  }

  return { status: response.status, body: body as T, headers: response.headers }
}
