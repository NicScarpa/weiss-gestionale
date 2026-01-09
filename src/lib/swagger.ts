import { createSwaggerSpec } from 'next-swagger-doc'

export const getApiDocs = async () => {
  const spec = createSwaggerSpec({
    apiFolder: 'src/app/api',
    definition: {
      openapi: '3.0.0',
      info: {
        title: 'Weiss Cafè Gestionale API',
        version: '1.0.0',
        description: `
API per il Sistema Gestionale Weiss Cafè.

## Autenticazione

Tutte le API richiedono autenticazione tramite sessione.
L'accesso è basato sui ruoli:
- **admin**: Accesso completo a tutte le risorse
- **manager**: Gestione chiusure e prima nota della propria sede
- **staff**: Visualizzazione limitata e portale dipendente

## Rate Limiting

Le API sono soggette a rate limiting:
- Endpoint auth: 5 richieste/minuto per IP
- API generiche: 100 richieste/minuto per utente

## Formato Date

Tutte le date sono in formato ISO 8601 (es: 2024-01-15T10:30:00.000Z).
Il timezone di riferimento è Europe/Rome.

## Formato Valuta

Gli importi monetari sono rappresentati come numeri con 2 decimali.
Visualizzazione italiana: €1.234,56 (virgola come separatore decimale)
        `,
        contact: {
          name: 'Supporto Tecnico',
          email: 'support@weiss-cafe.it',
        },
      },
      tags: [
        {
          name: 'Chiusure',
          description: 'Gestione chiusure cassa giornaliere',
        },
        {
          name: 'Prima Nota',
          description: 'Movimenti contabili (cassa e banca)',
        },
        {
          name: 'Budget',
          description: 'Gestione budget e previsioni',
        },
        {
          name: 'Staff',
          description: 'Gestione dipendenti e presenze',
        },
        {
          name: 'Venues',
          description: 'Gestione sedi',
        },
        {
          name: 'Auth',
          description: 'Autenticazione e autorizzazione',
        },
      ],
      servers: [
        {
          url: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
          description: 'Server corrente',
        },
      ],
      components: {
        securitySchemes: {
          sessionAuth: {
            type: 'apiKey',
            in: 'cookie',
            name: 'next-auth.session-token',
            description: 'Cookie di sessione Next-Auth',
          },
        },
        schemas: {
          Error: {
            type: 'object',
            properties: {
              error: {
                type: 'string',
                description: 'Messaggio di errore',
              },
              details: {
                type: 'array',
                description: 'Dettagli errori di validazione',
                items: {
                  type: 'object',
                },
              },
            },
            required: ['error'],
          },
          Pagination: {
            type: 'object',
            properties: {
              page: {
                type: 'integer',
                description: 'Pagina corrente',
                example: 1,
              },
              limit: {
                type: 'integer',
                description: 'Elementi per pagina',
                example: 20,
              },
              total: {
                type: 'integer',
                description: 'Totale elementi',
                example: 100,
              },
              totalPages: {
                type: 'integer',
                description: 'Totale pagine',
                example: 5,
              },
            },
          },
          Venue: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              name: { type: 'string', example: 'Weiss Cafè' },
              code: { type: 'string', example: 'WEISS' },
            },
          },
          CashStation: {
            type: 'object',
            properties: {
              name: { type: 'string', example: 'BAR' },
              position: { type: 'integer', example: 0 },
              cashAmount: { type: 'number', example: 550.0 },
              posAmount: { type: 'number', example: 1200.0 },
              receiptAmount: { type: 'number', example: 1750.0 },
              floatAmount: { type: 'number', example: 114.0 },
              cashCount: {
                $ref: '#/components/schemas/CashCount',
              },
            },
          },
          CashCount: {
            type: 'object',
            description: 'Conteggio fisico banconote e monete',
            properties: {
              bills500: { type: 'integer', default: 0 },
              bills200: { type: 'integer', default: 0 },
              bills100: { type: 'integer', default: 0 },
              bills50: { type: 'integer', default: 0 },
              bills20: { type: 'integer', default: 0 },
              bills10: { type: 'integer', default: 0 },
              bills5: { type: 'integer', default: 0 },
              coins2: { type: 'integer', default: 0 },
              coins1: { type: 'integer', default: 0 },
              coins050: { type: 'integer', default: 0 },
              coins020: { type: 'integer', default: 0 },
              coins010: { type: 'integer', default: 0 },
              coins005: { type: 'integer', default: 0 },
              coins002: { type: 'integer', default: 0 },
              coins001: { type: 'integer', default: 0 },
            },
          },
          Expense: {
            type: 'object',
            properties: {
              payee: { type: 'string', example: 'Fornitore S.r.l.' },
              description: { type: 'string', example: 'Acquisto merci' },
              documentType: {
                type: 'string',
                enum: ['NONE', 'FATTURA', 'DDT', 'RICEVUTA', 'PERSONALE'],
              },
              amount: { type: 'number', example: 150.0 },
              isPaid: { type: 'boolean', default: true },
            },
          },
          Closure: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              date: { type: 'string', format: 'date' },
              venueId: { type: 'string', format: 'uuid' },
              status: {
                type: 'string',
                enum: ['DRAFT', 'SUBMITTED', 'VALIDATED'],
              },
              isEvent: { type: 'boolean' },
              eventName: { type: 'string', nullable: true },
              weatherMorning: { type: 'string', nullable: true },
              weatherAfternoon: { type: 'string', nullable: true },
              weatherEvening: { type: 'string', nullable: true },
              notes: { type: 'string', nullable: true },
              grossTotal: { type: 'number' },
              createdAt: { type: 'string', format: 'date-time' },
              updatedAt: { type: 'string', format: 'date-time' },
            },
          },
          ClosureCreate: {
            type: 'object',
            required: ['date', 'venueId'],
            properties: {
              date: {
                type: 'string',
                format: 'date-time',
                description: 'Data della chiusura',
              },
              venueId: { type: 'string', format: 'uuid' },
              isEvent: { type: 'boolean', default: false },
              eventName: { type: 'string' },
              weatherMorning: { type: 'string' },
              weatherAfternoon: { type: 'string' },
              weatherEvening: { type: 'string' },
              notes: { type: 'string' },
              stations: {
                type: 'array',
                items: { $ref: '#/components/schemas/CashStation' },
              },
              expenses: {
                type: 'array',
                items: { $ref: '#/components/schemas/Expense' },
              },
            },
          },
          JournalEntry: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              venueId: { type: 'string', format: 'uuid' },
              date: { type: 'string', format: 'date' },
              registerType: {
                type: 'string',
                enum: ['CASH', 'BANK'],
              },
              description: { type: 'string' },
              documentRef: { type: 'string', nullable: true },
              documentType: { type: 'string', nullable: true },
              debitAmount: { type: 'number', nullable: true },
              creditAmount: { type: 'number', nullable: true },
              vatAmount: { type: 'number', nullable: true },
              accountId: { type: 'string', format: 'uuid', nullable: true },
              closureId: { type: 'string', format: 'uuid', nullable: true },
              createdAt: { type: 'string', format: 'date-time' },
            },
          },
          JournalEntryCreate: {
            type: 'object',
            required: ['date', 'registerType', 'description', 'entryType', 'amount'],
            properties: {
              date: { type: 'string', format: 'date-time' },
              registerType: {
                type: 'string',
                enum: ['CASH', 'BANK'],
              },
              entryType: {
                type: 'string',
                enum: ['INCOME', 'EXPENSE'],
              },
              description: { type: 'string' },
              documentRef: { type: 'string' },
              documentType: { type: 'string' },
              amount: { type: 'number', minimum: 0 },
              vatAmount: { type: 'number' },
              accountId: { type: 'string', format: 'uuid' },
            },
          },
        },
        responses: {
          Unauthorized: {
            description: 'Utente non autenticato',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/Error',
                },
                example: {
                  error: 'Non autorizzato',
                },
              },
            },
          },
          Forbidden: {
            description: 'Accesso negato',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/Error',
                },
                example: {
                  error: 'Accesso negato',
                },
              },
            },
          },
          BadRequest: {
            description: 'Dati non validi',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/Error',
                },
              },
            },
          },
          NotFound: {
            description: 'Risorsa non trovata',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/Error',
                },
                example: {
                  error: 'Risorsa non trovata',
                },
              },
            },
          },
        },
      },
      security: [
        {
          sessionAuth: [],
        },
      ],
    },
  })
  return spec
}
