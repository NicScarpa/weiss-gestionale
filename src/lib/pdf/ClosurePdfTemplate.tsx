import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
} from '@react-pdf/renderer'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import * as path from 'path'

// ============================================================
// Types
// ============================================================

interface CashCountData {
  bills500: number
  bills200: number
  bills100: number
  bills50: number
  bills20: number
  bills10: number
  bills5: number
  coins2: number
  coins1: number
  coins050: number
  coins020: number
  coins010: number
  coins005: number
  coins002: number
  coins001: number
  totalCounted: number
  expectedTotal: number
  difference: number
}

interface ClosurePdfProps {
  closure: {
    id: string
    date: Date
    status: string
    notes: string | null
    isEvent: boolean
    eventName: string | null
    weatherMorning: string | null
    weatherAfternoon: string | null
    weatherEvening: string | null
    venue: { name: string; code: string }
    submittedBy?: { firstName: string; lastName: string } | null
    validatedBy?: { firstName: string; lastName: string } | null
    totalCash: number
    totalPos: number
    totalRevenue: number
    totalExpenses: number
    netCash: number
    stations: Array<{
      name: string
      receiptAmount: number
      receiptVat: number
      invoiceAmount: number
      suspendedAmount: number
      cashAmount: number
      posAmount: number
      totalAmount: number
      cashCount: CashCountData | null
    }>
    expenses: Array<{
      payee: string
      description: string | null
      paidBy: string | null
      amount: number
    }>
    partials: Array<{
      timeSlot: string
      receiptProgressive: number
      posProgressive: number
      total: number
      coffeeCounter: number | null
      coffeeDelta: number | null
      weather: string | null
    }>
    attendance: Array<{
      userName: string
      shift: string
      statusCode: string | null
      hours: number | null
      hourlyRate: number | null
      totalPay: number | null
      isPaid: boolean
      isExtra: boolean
    }>
  }
}

// ============================================================
// Styles
// ============================================================

const COLORS = {
  black: '#1d1d1b',
  darkGray: '#333333',
  mediumGray: '#666666',
  lightGray: '#999999',
  borderGray: '#cccccc',
  bgLight: '#f5f5f5',
  bgHeader: '#e8e8e8',
  white: '#ffffff',
  red: '#cc0000',
  green: '#008800',
}

const s = StyleSheet.create({
  page: {
    padding: 24,
    paddingBottom: 50,
    fontSize: 8,
    fontFamily: 'Helvetica',
    color: COLORS.black,
  },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 1.5,
    borderBottomColor: COLORS.black,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  logo: {
    width: 70,
    height: 50,
  },
  headerInfo: {},
  headerTitle: {
    fontSize: 14,
    fontFamily: 'Helvetica-Bold',
  },
  headerSubtitle: {
    fontSize: 9,
    color: COLORS.mediumGray,
    marginTop: 1,
  },
  headerRight: {
    alignItems: 'flex-end',
  },
  headerDate: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
  },
  headerMeta: {
    fontSize: 7,
    color: COLORS.mediumGray,
    marginTop: 2,
  },

  // Section titles
  sectionTitle: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: COLORS.black,
    backgroundColor: COLORS.bgHeader,
    padding: '3 4',
    marginBottom: 2,
    marginTop: 8,
  },

  // Table generic
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.borderGray,
    paddingVertical: 2,
    minHeight: 13,
    alignItems: 'center',
  },
  tableRowAlt: {
    backgroundColor: COLORS.bgLight,
  },
  tableRowTotal: {
    backgroundColor: COLORS.bgHeader,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.black,
    borderTopWidth: 1,
    borderTopColor: COLORS.black,
  },
  tableHeaderRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.black,
    paddingVertical: 2,
    backgroundColor: COLORS.bgHeader,
    minHeight: 14,
    alignItems: 'center',
  },
  tableHeaderText: {
    fontSize: 7,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'center',
  },
  tableCellText: {
    fontSize: 7.5,
  },
  tableCellRight: {
    textAlign: 'right',
    fontSize: 7.5,
  },
  tableCellCenter: {
    textAlign: 'center',
    fontSize: 7.5,
  },
  bold: {
    fontFamily: 'Helvetica-Bold',
  },

  // Stations table column widths (8 columns)
  stColName: { width: '14%', paddingLeft: 3 },
  stColReceipt: { width: '13%', paddingRight: 3 },
  stColVat: { width: '11%', paddingRight: 3 },
  stColInvoice: { width: '11%', paddingRight: 3 },
  stColSuspended: { width: '11%', paddingRight: 3 },
  stColCash: { width: '13%', paddingRight: 3 },
  stColPos: { width: '13%', paddingRight: 3 },
  stColTotal: { width: '14%', paddingRight: 3 },

  // Expenses table
  expColDesc: { width: '55%', paddingLeft: 3 },
  expColPaidBy: { width: '20%' },
  expColAmount: { width: '25%', paddingRight: 3 },

  // Partials
  partialsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 2,
    marginBottom: 4,
  },
  partialCard: {
    width: '48%',
    border: '0.5 solid ' + COLORS.borderGray,
    borderRadius: 2,
    padding: '3 5',
  },
  partialTime: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
  },
  partialDetail: {
    fontSize: 7,
    color: COLORS.mediumGray,
    marginTop: 1,
  },

  // Two-column layout
  twoColContainer: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  colLeft: {
    width: '48%',
  },
  colRight: {
    width: '52%',
  },

  // Cash count grid
  cashCountRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.borderGray,
    paddingVertical: 1.5,
    alignItems: 'center',
  },
  cashCountLabel: {
    width: '35%',
    fontSize: 7,
    paddingLeft: 3,
  },
  cashCountQty: {
    width: '25%',
    fontSize: 7,
    textAlign: 'center',
  },
  cashCountValue: {
    width: '40%',
    fontSize: 7,
    textAlign: 'right',
    paddingRight: 3,
  },

  // Attendance
  attRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.borderGray,
    paddingVertical: 2,
    alignItems: 'center',
  },
  attColName: { width: '50%', paddingLeft: 3 },
  attColShift: { width: '50%' },

  // Extra table
  extraColName: { width: '45%', paddingLeft: 3 },
  extraColHours: { width: '20%' },
  extraColPay: { width: '20%', paddingRight: 3 },
  extraColPaid: { width: '15%' },

  // Summary
  summaryBox: {
    marginTop: 6,
    border: '1 solid ' + COLORS.black,
    padding: 6,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 1.5,
  },
  summaryLabel: {
    fontSize: 8,
  },
  summaryValue: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
  },
  summaryDivider: {
    borderTopWidth: 1,
    borderTopColor: COLORS.black,
    marginVertical: 3,
  },
  summaryTotalLabel: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
  },
  summaryTotalValue: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
  },

  // Footer
  footer: {
    position: 'absolute',
    bottom: 20,
    left: 24,
    right: 24,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 6.5,
    color: COLORS.lightGray,
    borderTopWidth: 0.5,
    borderTopColor: COLORS.borderGray,
    paddingTop: 6,
  },

  // Notes
  notesBox: {
    marginTop: 6,
    padding: '4 6',
    border: '0.5 solid ' + COLORS.borderGray,
    borderRadius: 2,
  },
  notesText: {
    fontSize: 7.5,
    lineHeight: 1.4,
  },
})

// ============================================================
// Helpers
// ============================================================

function fmt(value: number | null | undefined): string {
  if (value === null || value === undefined || isNaN(value)) return '-'
  if (value === 0) return '-'
  return new Intl.NumberFormat('it-IT', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

function fmtCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined || isNaN(value)) return '0,00 €'
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
  }).format(value)
}

function getWeatherString(closure: ClosurePdfProps['closure']): string {
  const parts: string[] = []
  if (closure.weatherMorning) parts.push(`Matt: ${closure.weatherMorning}`)
  if (closure.weatherAfternoon) parts.push(`Pom: ${closure.weatherAfternoon}`)
  if (closure.weatherEvening) parts.push(`Sera: ${closure.weatherEvening}`)
  return parts.join(' / ') || '-'
}

// Denomination definitions for cash count
const DENOMINATIONS = [
  { key: 'bills500', label: '€ 500', value: 500 },
  { key: 'bills200', label: '€ 200', value: 200 },
  { key: 'bills100', label: '€ 100', value: 100 },
  { key: 'bills50', label: '€ 50', value: 50 },
  { key: 'bills20', label: '€ 20', value: 20 },
  { key: 'bills10', label: '€ 10', value: 10 },
  { key: 'bills5', label: '€ 5', value: 5 },
  { key: 'coins2', label: '€ 2', value: 2 },
  { key: 'coins1', label: '€ 1', value: 1 },
  { key: 'coins050', label: '€ 0,50', value: 0.5 },
  { key: 'coins020', label: '€ 0,20', value: 0.2 },
  { key: 'coins010', label: '€ 0,10', value: 0.1 },
  { key: 'coins005', label: '€ 0,05', value: 0.05 },
  { key: 'coins002', label: '€ 0,02', value: 0.02 },
  { key: 'coins001', label: '€ 0,01', value: 0.01 },
] as const

// Aggregate cash counts from all stations
function aggregateCashCounts(stations: ClosurePdfProps['closure']['stations']): Record<string, number> | null {
  const countsAvailable = stations.some(st => st.cashCount !== null)
  if (!countsAvailable) return null

  const totals: Record<string, number> = {}
  for (const d of DENOMINATIONS) {
    totals[d.key] = 0
  }

  for (const st of stations) {
    if (!st.cashCount) continue
    for (const d of DENOMINATIONS) {
      totals[d.key] += (st.cashCount as unknown as Record<string, number>)[d.key] || 0
    }
  }

  return totals
}

// ============================================================
// Components
// ============================================================

function Header({ closure }: ClosurePdfProps) {
  const formattedDate = format(new Date(closure.date), "EEEE d MMMM yyyy", { locale: it })
  const logoPath = path.join(process.cwd(), 'public', 'images', 'logo.png')

  return (
    <View style={s.header}>
      <View style={s.headerLeft}>
        <Image style={s.logo} src={logoPath} />
        <View style={s.headerInfo}>
          <Text style={s.headerTitle}>CHIUSURA CASSA</Text>
          <Text style={s.headerSubtitle}>
            {closure.venue.name}
            {closure.isEvent && closure.eventName ? ` — ${closure.eventName}` : ''}
          </Text>
        </View>
      </View>
      <View style={s.headerRight}>
        <Text style={s.headerDate}>{formattedDate}</Text>
        <Text style={s.headerMeta}>METEO: {getWeatherString(closure)}</Text>
        {closure.submittedBy && (
          <Text style={s.headerMeta}>
            Compilata: {closure.submittedBy.firstName} {closure.submittedBy.lastName}
          </Text>
        )}
        {closure.validatedBy && (
          <Text style={s.headerMeta}>
            Validata: {closure.validatedBy.firstName} {closure.validatedBy.lastName}
          </Text>
        )}
      </View>
    </View>
  )
}

function StationsTable({ closure }: ClosurePdfProps) {
  const totals = {
    receiptAmount: closure.stations.reduce((sum, st) => sum + st.receiptAmount, 0),
    receiptVat: closure.stations.reduce((sum, st) => sum + st.receiptVat, 0),
    invoiceAmount: closure.stations.reduce((sum, st) => sum + st.invoiceAmount, 0),
    suspendedAmount: closure.stations.reduce((sum, st) => sum + st.suspendedAmount, 0),
    cashAmount: closure.stations.reduce((sum, st) => sum + st.cashAmount, 0),
    posAmount: closure.stations.reduce((sum, st) => sum + st.posAmount, 0),
    totalAmount: closure.stations.reduce((sum, st) => sum + st.totalAmount, 0),
  }

  return (
    <View>
      <Text style={s.sectionTitle}>POSTAZIONI CASSA</Text>
      {/* Header */}
      <View style={s.tableHeaderRow}>
        <Text style={[s.tableHeaderText, s.stColName]}>POSTAZIONE</Text>
        <Text style={[s.tableHeaderText, s.stColReceipt]}>CORRISP.</Text>
        <Text style={[s.tableHeaderText, s.stColVat]}>IVA</Text>
        <Text style={[s.tableHeaderText, s.stColInvoice]}>FATTURE</Text>
        <Text style={[s.tableHeaderText, s.stColSuspended]}>SOSPESI</Text>
        <Text style={[s.tableHeaderText, s.stColCash]}>CONTANTI</Text>
        <Text style={[s.tableHeaderText, s.stColPos]}>POS</Text>
        <Text style={[s.tableHeaderText, s.stColTotal]}>TOTALE</Text>
      </View>
      {/* Rows */}
      {closure.stations.map((st, idx) => (
        <View key={idx} style={[s.tableRow, idx % 2 === 1 ? s.tableRowAlt : {}]}>
          <Text style={[s.tableCellText, s.bold, s.stColName]}>{st.name}</Text>
          <Text style={[s.tableCellRight, s.stColReceipt]}>{fmt(st.receiptAmount)}</Text>
          <Text style={[s.tableCellRight, s.stColVat]}>{fmt(st.receiptVat)}</Text>
          <Text style={[s.tableCellRight, s.stColInvoice]}>{fmt(st.invoiceAmount)}</Text>
          <Text style={[s.tableCellRight, s.stColSuspended]}>{fmt(st.suspendedAmount)}</Text>
          <Text style={[s.tableCellRight, s.stColCash]}>{fmt(st.cashAmount)}</Text>
          <Text style={[s.tableCellRight, s.stColPos]}>{fmt(st.posAmount)}</Text>
          <Text style={[s.tableCellRight, s.bold, s.stColTotal]}>{fmt(st.totalAmount)}</Text>
        </View>
      ))}
      {/* Total */}
      <View style={[s.tableRow, s.tableRowTotal]}>
        <Text style={[s.tableCellText, s.bold, s.stColName]}>TOTALE</Text>
        <Text style={[s.tableCellRight, s.bold, s.stColReceipt]}>{fmt(totals.receiptAmount)}</Text>
        <Text style={[s.tableCellRight, s.bold, s.stColVat]}>{fmt(totals.receiptVat)}</Text>
        <Text style={[s.tableCellRight, s.bold, s.stColInvoice]}>{fmt(totals.invoiceAmount)}</Text>
        <Text style={[s.tableCellRight, s.bold, s.stColSuspended]}>{fmt(totals.suspendedAmount)}</Text>
        <Text style={[s.tableCellRight, s.bold, s.stColCash]}>{fmt(totals.cashAmount)}</Text>
        <Text style={[s.tableCellRight, s.bold, s.stColPos]}>{fmt(totals.posAmount)}</Text>
        <Text style={[s.tableCellRight, s.bold, s.stColTotal]}>{fmt(totals.totalAmount)}</Text>
      </View>
    </View>
  )
}

function PartialsSection({ closure }: ClosurePdfProps) {
  if (closure.partials.length === 0) return null
  return (
    <View>
      <Text style={s.sectionTitle}>PARZIALI ORARI</Text>
      <View style={s.partialsContainer}>
        {closure.partials.map((p, idx) => (
          <View key={idx} style={s.partialCard}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={s.partialTime}>Ore {p.timeSlot}</Text>
              <Text style={[s.partialTime]}>{fmt(p.total)} €</Text>
            </View>
            <Text style={s.partialDetail}>
              Cont. {fmt(p.receiptProgressive)} + POS {fmt(p.posProgressive)}
              {p.weather ? `  |  ${p.weather}` : ''}
            </Text>
            {p.coffeeCounter !== null && (
              <Text style={s.partialDetail}>
                Caffè: {p.coffeeCounter}
                {p.coffeeDelta !== null ? ` (Δ ${p.coffeeDelta})` : ''}
              </Text>
            )}
          </View>
        ))}
      </View>
    </View>
  )
}

function ExpensesTable({ closure }: ClosurePdfProps) {
  if (closure.expenses.length === 0) return null
  return (
    <View>
      <Text style={s.sectionTitle}>USCITE</Text>
      <View style={s.tableHeaderRow}>
        <Text style={[s.tableHeaderText, s.expColDesc, { textAlign: 'left', paddingLeft: 3 }]}>CAUSALE</Text>
        <Text style={[s.tableHeaderText, s.expColPaidBy]}>PAGAMENTO</Text>
        <Text style={[s.tableHeaderText, s.expColAmount, { textAlign: 'right', paddingRight: 3 }]}>IMPORTO</Text>
      </View>
      {closure.expenses.map((exp, idx) => (
        <View key={idx} style={[s.tableRow, idx % 2 === 1 ? s.tableRowAlt : {}]}>
          <Text style={[s.tableCellText, s.expColDesc]}>
            {exp.payee}{exp.description ? ` — ${exp.description}` : ''}
          </Text>
          <Text style={[s.tableCellCenter, s.expColPaidBy]}>{exp.paidBy || 'CASSA'}</Text>
          <Text style={[s.tableCellRight, s.expColAmount]}>{fmt(exp.amount)}</Text>
        </View>
      ))}
      <View style={[s.tableRow, s.tableRowTotal]}>
        <Text style={[s.tableCellText, s.bold, s.expColDesc]}>TOTALE USCITE</Text>
        <Text style={[s.tableCellCenter, s.expColPaidBy]}></Text>
        <Text style={[s.tableCellRight, s.bold, s.expColAmount]}>{fmt(closure.totalExpenses)}</Text>
      </View>
    </View>
  )
}

function CashCountSection({ closure }: ClosurePdfProps) {
  const counts = aggregateCashCounts(closure.stations)
  if (!counts) return null

  let total = 0
  for (const d of DENOMINATIONS) {
    total += (counts[d.key] || 0) * d.value
  }

  return (
    <View>
      <Text style={s.sectionTitle}>LIQUIDITÀ</Text>
      {/* Header */}
      <View style={[s.cashCountRow, { borderBottomWidth: 1, borderBottomColor: COLORS.black }]}>
        <Text style={[s.cashCountLabel, s.bold, { fontSize: 7 }]}>TAGLIO</Text>
        <Text style={[s.cashCountQty, s.bold, { fontSize: 7 }]}>QTÀ</Text>
        <Text style={[s.cashCountValue, s.bold, { fontSize: 7 }]}>VALORE</Text>
      </View>
      {DENOMINATIONS.map((d) => {
        const qty = counts[d.key] || 0
        if (qty === 0) return null
        return (
          <View key={d.key} style={s.cashCountRow}>
            <Text style={s.cashCountLabel}>{d.label}</Text>
            <Text style={s.cashCountQty}>{qty}</Text>
            <Text style={s.cashCountValue}>{fmt(qty * d.value)}</Text>
          </View>
        )
      })}
      {/* Total */}
      <View style={[s.cashCountRow, { borderTopWidth: 1, borderTopColor: COLORS.black, borderBottomWidth: 0 }]}>
        <Text style={[s.cashCountLabel, s.bold]}>TOTALE</Text>
        <Text style={s.cashCountQty}></Text>
        <Text style={[s.cashCountValue, s.bold]}>{fmt(total)}</Text>
      </View>
    </View>
  )
}

function AttendanceSection({ closure }: ClosurePdfProps) {
  const staff = closure.attendance.filter(a => !a.isExtra)
  const extras = closure.attendance.filter(a => a.isExtra)
  const morningStaff = staff.filter(a => a.shift === 'MORNING')
  const eveningStaff = staff.filter(a => a.shift === 'EVENING')

  if (staff.length === 0 && extras.length === 0) return null

  return (
    <View>
      {/* Fixed Staff */}
      {staff.length > 0 && (
        <View>
          <Text style={s.sectionTitle}>DIPENDENTI</Text>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {/* Morning column */}
            <View style={{ width: '50%' }}>
              <View style={[s.tableHeaderRow, { minHeight: 12 }]}>
                <Text style={[s.tableHeaderText, { width: '100%' }]}>MATTINA</Text>
              </View>
              {morningStaff.length > 0 ? morningStaff.map((a, idx) => (
                <View key={idx} style={s.attRow}>
                  <Text style={[s.tableCellText, { paddingLeft: 3 }]}>
                    {a.userName}{a.statusCode ? ` (${a.statusCode})` : ''}
                  </Text>
                </View>
              )) : (
                <View style={s.attRow}>
                  <Text style={[s.tableCellText, { paddingLeft: 3, color: COLORS.lightGray }]}>-</Text>
                </View>
              )}
            </View>
            {/* Evening column */}
            <View style={{ width: '50%' }}>
              <View style={[s.tableHeaderRow, { minHeight: 12 }]}>
                <Text style={[s.tableHeaderText, { width: '100%' }]}>SERA</Text>
              </View>
              {eveningStaff.length > 0 ? eveningStaff.map((a, idx) => (
                <View key={idx} style={s.attRow}>
                  <Text style={[s.tableCellText, { paddingLeft: 3 }]}>
                    {a.userName}{a.statusCode ? ` (${a.statusCode})` : ''}
                  </Text>
                </View>
              )) : (
                <View style={s.attRow}>
                  <Text style={[s.tableCellText, { paddingLeft: 3, color: COLORS.lightGray }]}>-</Text>
                </View>
              )}
            </View>
          </View>
        </View>
      )}

      {/* Extras */}
      {extras.length > 0 && (
        <View style={{ marginTop: 6 }}>
          <Text style={s.sectionTitle}>EXTRA</Text>
          <View style={s.tableHeaderRow}>
            <Text style={[s.tableHeaderText, s.extraColName, { textAlign: 'left', paddingLeft: 3 }]}>NOME</Text>
            <Text style={[s.tableHeaderText, s.extraColHours]}>ORE</Text>
            <Text style={[s.tableHeaderText, s.extraColPay, { textAlign: 'right', paddingRight: 3 }]}>COMPENSO</Text>
            <Text style={[s.tableHeaderText, s.extraColPaid]}>PAGATO</Text>
          </View>
          {extras.map((a, idx) => (
            <View key={idx} style={[s.tableRow, idx % 2 === 1 ? s.tableRowAlt : {}]}>
              <Text style={[s.tableCellText, s.extraColName]}>{a.userName}</Text>
              <Text style={[s.tableCellCenter, s.extraColHours]}>{a.hours ? `${a.hours}h` : '-'}</Text>
              <Text style={[s.tableCellRight, s.extraColPay]}>{a.totalPay ? fmt(a.totalPay) : '-'}</Text>
              <Text style={[s.tableCellCenter, s.extraColPaid]}>{a.isPaid ? 'Sì' : 'No'}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  )
}

function SummaryBox({ closure }: ClosurePdfProps) {
  const cashDiff = closure.stations.reduce((sum, st) => {
    if (!st.cashCount) return sum
    return sum + st.cashCount.difference
  }, 0)
  const hasCashCount = closure.stations.some(st => st.cashCount !== null)

  return (
    <View style={s.summaryBox}>
      <View style={s.summaryRow}>
        <Text style={s.summaryLabel}>Totale Contanti</Text>
        <Text style={s.summaryValue}>{fmtCurrency(closure.totalCash)}</Text>
      </View>
      <View style={s.summaryRow}>
        <Text style={s.summaryLabel}>Totale POS</Text>
        <Text style={s.summaryValue}>{fmtCurrency(closure.totalPos)}</Text>
      </View>
      <View style={s.summaryRow}>
        <Text style={s.summaryLabel}>Totale Incassi</Text>
        <Text style={s.summaryValue}>{fmtCurrency(closure.totalRevenue)}</Text>
      </View>
      <View style={s.summaryRow}>
        <Text style={s.summaryLabel}>Totale Uscite</Text>
        <Text style={[s.summaryValue, { color: COLORS.red }]}>- {fmtCurrency(closure.totalExpenses)}</Text>
      </View>
      <View style={s.summaryDivider} />
      <View style={s.summaryRow}>
        <Text style={s.summaryTotalLabel}>CASSA NETTA</Text>
        <Text style={s.summaryTotalValue}>{fmtCurrency(closure.netCash)}</Text>
      </View>
      {hasCashCount && (
        <View style={[s.summaryRow, { marginTop: 2 }]}>
          <Text style={s.summaryLabel}>Differenza Cassa</Text>
          <Text style={[s.summaryValue, { color: cashDiff >= 0 ? COLORS.green : COLORS.red }]}>
            {cashDiff >= 0 ? '+' : ''}{fmtCurrency(cashDiff)}
          </Text>
        </View>
      )}
    </View>
  )
}

function Footer({ closure }: ClosurePdfProps) {
  return (
    <View style={s.footer} fixed>
      <Text>Weiss Cafè Gestionale</Text>
      <Text>Generato il {format(new Date(), "dd/MM/yyyy 'alle' HH:mm", { locale: it })}</Text>
      <Text>ID: {closure.id.slice(0, 8)}</Text>
    </View>
  )
}

// ============================================================
// Main Document
// ============================================================

export function ClosurePdfDocument({ closure }: ClosurePdfProps) {
  return (
    <Document>
      <Page size="A4" style={s.page}>
        <Header closure={closure} />
        <StationsTable closure={closure} />
        <PartialsSection closure={closure} />
        <ExpensesTable closure={closure} />

        {/* Two-column layout: Cash Count + Attendance */}
        <View style={s.twoColContainer}>
          <View style={s.colLeft}>
            <CashCountSection closure={closure} />
          </View>
          <View style={s.colRight}>
            <AttendanceSection closure={closure} />
          </View>
        </View>

        {/* Summary */}
        <SummaryBox closure={closure} />

        {/* Notes */}
        {closure.notes && (
          <View style={s.notesBox}>
            <Text style={[s.bold, { fontSize: 7, marginBottom: 2 }]}>NOTE:</Text>
            <Text style={s.notesText}>{closure.notes}</Text>
          </View>
        )}

        <Footer closure={closure} />
      </Page>
    </Document>
  )
}
