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
 */
export async function callRoute<T = unknown, P extends Record<string, string> = Record<string, string>>(
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
