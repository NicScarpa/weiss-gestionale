/**
 * Rigenera il PDF della chiusura del 6 agosto 2026 con i numeri veri letti dal
 * foglio stampato, senza toccare il database (il .env punta alla produzione).
 * Serve a guardare con gli occhi le correzioni, non è un test automatico.
 *
 *   npx tsx scripts/prova-pdf-chiusura.ts
 */
import { renderToFile } from '@react-pdf/renderer'
import { ClosurePdfDocument } from '../src/lib/pdf/ClosurePdfTemplate'
import { calcolaDeltaCaffe } from '../src/lib/pdf/closure-pdf-data'

const partialsGrezzi = [
  { timeSlot: '16:00', receiptProgressive: 448.8, posProgressive: 112.2, coffeeCounter: 9099, weather: 'sunny' },
  { timeSlot: '21:00', receiptProgressive: 998.2, posProgressive: 226, coffeeCounter: 9105, weather: 'sunny' },
]

// Prima chiusura inserita: non esiste un giorno precedente a cui agganciarsi.
const delta = calcolaDeltaCaffe(partialsGrezzi.map((p) => p.coffeeCounter), null)

const closure = {
  id: 'cmsxautp-prova',
  date: new Date('2026-08-06'),
  status: 'SUBMITTED',
  notes: 'Giovediamo',
  isEvent: false,
  eventName: null,
  weatherMorning: 'sunny',
  weatherAfternoon: 'sunny',
  weatherEvening: 'sunny',
  venue: { name: 'Weiss Cafè', code: 'WC' },
  submittedBy: { firstName: 'Nicola', lastName: 'Scarpa' },
  validatedBy: null,
  totalCash: 1157.8,
  totalPos: 1015.7,
  totalRevenue: 2173.5,
  totalExpenses: 124.9,
  netCash: 1032.9,
  stations: [
    {
      name: 'BAR',
      receiptAmount: 2120.5,
      receiptVat: 192.77,
      invoiceAmount: 0,
      suspendedAmount: 0,
      cashAmount: 1157.8,
      posAmount: 1015.7,
      totalAmount: 2173.5,
      cashCount: {
        bills500: 0, bills200: 0, bills100: 1, bills50: 10, bills20: 24,
        bills10: 1, bills5: 5, coins2: 18, coins1: 1, coins050: 10,
        coins020: 4, coins010: 0, coins005: 0, coins002: 0, coins001: 0,
        totalCounted: 1157.8, expectedTotal: 1157.8, difference: 0,
      },
    },
  ],
  expenses: [
    { payee: 'BRUNETTA LUCIA CARLA', description: null, documentType: 'DDT', documentRef: null, vatAmount: null, isPaid: true, paidBy: 'BAR', amount: 2.9 },
    { payee: 'SCARPA NICOLA', description: null, documentType: 'NONE', documentRef: null, vatAmount: null, isPaid: true, paidBy: 'BAR', amount: 50 },
    { payee: 'Alessandra Piazzon', description: 'Compenso mattina - 9h x 8,00 €/h', documentType: 'PERSONALE', documentRef: null, vatAmount: null, isPaid: true, paidBy: 'BAR', amount: 72 },
  ],
  partials: partialsGrezzi.map((p, i) => ({ ...p, coffeeDelta: delta[i] })),
  attendance: [
    { userName: 'Vanessa Basso', shift: 'MORNING', statusCode: 'R', hours: null, hourlyRate: null, totalPay: null, isPaid: false, isExtra: false },
    // Presente con le ore compilate: deve comparire «8h», non «P»
    { userName: 'Andrea Segatto', shift: 'EVENING', statusCode: 'P', hours: 8, hourlyRate: null, totalPay: null, isPaid: false, isExtra: false },
    { userName: 'Brian Monferone', shift: 'EVENING', statusCode: 'FE', hours: null, hourlyRate: null, totalPay: null, isPaid: false, isExtra: false },
    // Presente senza ore compilate: ripiega sulla P
    { userName: 'Matteo Momesso', shift: 'EVENING', statusCode: 'P', hours: null, hourlyRate: null, totalPay: null, isPaid: false, isExtra: false },
    { userName: 'Alessandra Piazzon', shift: 'MORNING', statusCode: 'P', hours: 9, hourlyRate: 8, totalPay: 72, isPaid: true, isExtra: true },
  ],
}

const destinazione = process.argv[2] || '/tmp/prova-chiusura.pdf'

renderToFile(ClosurePdfDocument({ closure }), destinazione)
  .then(() => console.log(`PDF scritto in ${destinazione}`))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
