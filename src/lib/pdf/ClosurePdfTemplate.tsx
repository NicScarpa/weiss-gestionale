import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from '@react-pdf/renderer'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'

// Styles
const styles = StyleSheet.create({
  page: {
    padding: 30,
    fontSize: 10,
    fontFamily: 'Helvetica',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
    paddingBottom: 10,
    borderBottomWidth: 2,
    borderBottomColor: '#0f172a',
  },
  headerLeft: {
    flex: 1,
  },
  headerRight: {
    alignItems: 'flex-end',
  },
  title: {
    fontSize: 18,
    fontFamily: 'Helvetica-Bold',
    color: '#0f172a',
  },
  subtitle: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  badge: {
    backgroundColor: '#22c55e',
    color: 'white',
    padding: '4 8',
    borderRadius: 4,
    fontSize: 9,
    marginTop: 4,
  },
  badgePending: {
    backgroundColor: '#f59e0b',
  },
  badgeDraft: {
    backgroundColor: '#94a3b8',
  },
  section: {
    marginBottom: 15,
  },
  sectionTitle: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    color: '#0f172a',
    marginBottom: 8,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  row: {
    flexDirection: 'row',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  rowHeader: {
    backgroundColor: '#f8fafc',
    fontFamily: 'Helvetica-Bold',
  },
  col: {
    flex: 1,
  },
  colNarrow: {
    width: 80,
  },
  colWide: {
    flex: 2,
  },
  textRight: {
    textAlign: 'right',
  },
  textCenter: {
    textAlign: 'center',
  },
  bold: {
    fontFamily: 'Helvetica-Bold',
  },
  summaryBox: {
    backgroundColor: '#f8fafc',
    padding: 12,
    borderRadius: 4,
    marginTop: 10,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  summaryTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 8,
    marginTop: 8,
    borderTopWidth: 2,
    borderTopColor: '#0f172a',
  },
  totalLabel: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
  },
  totalValue: {
    fontSize: 14,
    fontFamily: 'Helvetica-Bold',
    color: '#0f172a',
  },
  differencePositive: {
    color: '#22c55e',
  },
  differenceNegative: {
    color: '#ef4444',
  },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 30,
    right: 30,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 8,
    color: '#94a3b8',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    paddingTop: 10,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  gridItem: {
    width: '50%',
    paddingRight: 10,
    marginBottom: 8,
  },
  infoLabel: {
    fontSize: 8,
    color: '#64748b',
    marginBottom: 2,
  },
  infoValue: {
    fontSize: 10,
  },
  weatherRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  weatherItem: {
    flex: 1,
    alignItems: 'center',
    padding: 8,
    backgroundColor: '#f8fafc',
    borderRadius: 4,
    marginHorizontal: 2,
  },
})

// Format currency helper
function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined) return '0,00 €'
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
  }).format(value)
}

// Get status badge style
function getStatusStyle(status: string) {
  switch (status) {
    case 'VALIDATED':
      return styles.badge
    case 'SUBMITTED':
      return { ...styles.badge, ...styles.badgePending }
    default:
      return { ...styles.badge, ...styles.badgeDraft }
  }
}

function getStatusLabel(status: string) {
  switch (status) {
    case 'VALIDATED':
      return 'Validata'
    case 'SUBMITTED':
      return 'In Attesa'
    default:
      return 'Bozza'
  }
}

// Props interface
interface ClosurePdfProps {
  closure: {
    id: string
    date: Date
    status: string
    totalRevenue: number
    totalCash: number
    totalPos: number
    totalExpenses: number
    bankDeposit: number | null
    cashDifference: number
    netCash: number
    coffeeMachineStart: number | null
    coffeeMachineEnd: number | null
    coffeeSold: number | null
    notes: string | null
    weatherMorning: string | null
    weatherAfternoon: string | null
    weatherEvening: string | null
    venue: {
      name: string
      code: string
    }
    submittedBy?: {
      firstName: string
      lastName: string
    } | null
    validatedBy?: {
      firstName: string
      lastName: string
    } | null
    stations: Array<{
      name: string
      totalCash: number
      totalPos: number
      cashCount?: {
        bill500: number
        bill200: number
        bill100: number
        bill50: number
        bill20: number
        bill10: number
        bill5: number
        coin2: number
        coin1: number
        coin050: number
        coin020: number
        coin010: number
        coin005: number
        coin002: number
        coin001: number
      } | null
    }>
    expenses: Array<{
      description: string
      amount: number
      account?: {
        code: string
        name: string
      } | null
    }>
    partials: Array<{
      timeSlot: string
      amount: number
    }>
    attendance: Array<{
      status: string
      hoursWorked: number | null
      user: {
        firstName: string
        lastName: string
      }
    }>
  }
}

export function ClosurePdfDocument({ closure }: ClosurePdfProps) {
  const formattedDate = format(new Date(closure.date), "EEEE d MMMM yyyy", { locale: it })

  // Calculate totals
  const totalStationsCash = closure.stations.reduce((sum, s) => sum + Number(s.totalCash || 0), 0)
  const totalStationsPos = closure.stations.reduce((sum, s) => sum + Number(s.totalPos || 0), 0)

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.title}>Chiusura Cassa</Text>
            <Text style={styles.subtitle}>{closure.venue.name} ({closure.venue.code})</Text>
            <Text style={styles.subtitle}>{formattedDate}</Text>
          </View>
          <View style={styles.headerRight}>
            <Text style={getStatusStyle(closure.status)}>{getStatusLabel(closure.status)}</Text>
            {closure.submittedBy && (
              <Text style={{ fontSize: 8, color: '#64748b', marginTop: 4 }}>
                Compilata da: {closure.submittedBy.firstName} {closure.submittedBy.lastName}
              </Text>
            )}
            {closure.validatedBy && (
              <Text style={{ fontSize: 8, color: '#64748b', marginTop: 2 }}>
                Validata da: {closure.validatedBy.firstName} {closure.validatedBy.lastName}
              </Text>
            )}
          </View>
        </View>

        {/* Summary Box */}
        <View style={styles.summaryBox}>
          <View style={styles.summaryRow}>
            <Text>Totale Lordo</Text>
            <Text style={styles.bold}>{formatCurrency(Number(closure.totalRevenue))}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text>Contanti</Text>
            <Text>{formatCurrency(Number(closure.totalCash))}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text>POS</Text>
            <Text>{formatCurrency(Number(closure.totalPos))}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text>Uscite</Text>
            <Text style={{ color: '#ef4444' }}>- {formatCurrency(Number(closure.totalExpenses))}</Text>
          </View>
          {closure.bankDeposit && Number(closure.bankDeposit) > 0 && (
            <View style={styles.summaryRow}>
              <Text>Versamento Banca</Text>
              <Text>{formatCurrency(Number(closure.bankDeposit))}</Text>
            </View>
          )}
          <View style={styles.summaryTotal}>
            <Text style={styles.totalLabel}>Cassa Netta</Text>
            <Text style={styles.totalValue}>{formatCurrency(Number(closure.netCash))}</Text>
          </View>
          <View style={{ ...styles.summaryRow, marginTop: 4 }}>
            <Text>Differenza Cassa</Text>
            <Text style={Number(closure.cashDifference) >= 0 ? styles.differencePositive : styles.differenceNegative}>
              {Number(closure.cashDifference) >= 0 ? '+' : ''}{formatCurrency(Number(closure.cashDifference))}
            </Text>
          </View>
        </View>

        {/* Cash Stations */}
        {closure.stations.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Postazioni Cassa</Text>
            <View style={[styles.row, styles.rowHeader]}>
              <Text style={styles.colWide}>Postazione</Text>
              <Text style={[styles.col, styles.textRight]}>Contanti</Text>
              <Text style={[styles.col, styles.textRight]}>POS</Text>
              <Text style={[styles.col, styles.textRight]}>Totale</Text>
            </View>
            {closure.stations.map((station, idx) => (
              <View key={idx} style={styles.row}>
                <Text style={styles.colWide}>{station.name}</Text>
                <Text style={[styles.col, styles.textRight]}>{formatCurrency(Number(station.totalCash))}</Text>
                <Text style={[styles.col, styles.textRight]}>{formatCurrency(Number(station.totalPos))}</Text>
                <Text style={[styles.col, styles.textRight, styles.bold]}>
                  {formatCurrency(Number(station.totalCash) + Number(station.totalPos))}
                </Text>
              </View>
            ))}
            <View style={[styles.row, { backgroundColor: '#f1f5f9' }]}>
              <Text style={[styles.colWide, styles.bold]}>Totale</Text>
              <Text style={[styles.col, styles.textRight, styles.bold]}>{formatCurrency(totalStationsCash)}</Text>
              <Text style={[styles.col, styles.textRight, styles.bold]}>{formatCurrency(totalStationsPos)}</Text>
              <Text style={[styles.col, styles.textRight, styles.bold]}>
                {formatCurrency(totalStationsCash + totalStationsPos)}
              </Text>
            </View>
          </View>
        )}

        {/* Expenses */}
        {closure.expenses.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Uscite</Text>
            <View style={[styles.row, styles.rowHeader]}>
              <Text style={styles.colWide}>Descrizione</Text>
              <Text style={styles.col}>Conto</Text>
              <Text style={[styles.colNarrow, styles.textRight]}>Importo</Text>
            </View>
            {closure.expenses.map((expense, idx) => (
              <View key={idx} style={styles.row}>
                <Text style={styles.colWide}>{expense.description}</Text>
                <Text style={styles.col}>
                  {expense.account ? `${expense.account.code} - ${expense.account.name}` : '-'}
                </Text>
                <Text style={[styles.colNarrow, styles.textRight]}>{formatCurrency(Number(expense.amount))}</Text>
              </View>
            ))}
            <View style={[styles.row, { backgroundColor: '#f1f5f9' }]}>
              <Text style={[styles.colWide, styles.bold]}>Totale Uscite</Text>
              <Text style={styles.col}></Text>
              <Text style={[styles.colNarrow, styles.textRight, styles.bold]}>
                {formatCurrency(Number(closure.totalExpenses))}
              </Text>
            </View>
          </View>
        )}

        {/* Hourly Partials */}
        {closure.partials.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Parziali Orari</Text>
            <View style={styles.grid}>
              {closure.partials.map((partial, idx) => (
                <View key={idx} style={styles.gridItem}>
                  <Text style={styles.infoLabel}>{partial.timeSlot}</Text>
                  <Text style={styles.infoValue}>{formatCurrency(Number(partial.amount))}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Staff Attendance */}
        {closure.attendance.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Presenze</Text>
            <View style={[styles.row, styles.rowHeader]}>
              <Text style={styles.colWide}>Dipendente</Text>
              <Text style={[styles.col, styles.textCenter]}>Stato</Text>
              <Text style={[styles.colNarrow, styles.textRight]}>Ore</Text>
            </View>
            {closure.attendance.map((att, idx) => (
              <View key={idx} style={styles.row}>
                <Text style={styles.colWide}>{att.user.firstName} {att.user.lastName}</Text>
                <Text style={[styles.col, styles.textCenter]}>{att.status}</Text>
                <Text style={[styles.colNarrow, styles.textRight]}>
                  {att.hoursWorked ? `${att.hoursWorked}h` : '-'}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Weather */}
        {(closure.weatherMorning || closure.weatherAfternoon || closure.weatherEvening) && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Meteo</Text>
            <View style={styles.weatherRow}>
              {closure.weatherMorning && (
                <View style={styles.weatherItem}>
                  <Text style={styles.infoLabel}>Mattina</Text>
                  <Text style={styles.infoValue}>{closure.weatherMorning}</Text>
                </View>
              )}
              {closure.weatherAfternoon && (
                <View style={styles.weatherItem}>
                  <Text style={styles.infoLabel}>Pomeriggio</Text>
                  <Text style={styles.infoValue}>{closure.weatherAfternoon}</Text>
                </View>
              )}
              {closure.weatherEvening && (
                <View style={styles.weatherItem}>
                  <Text style={styles.infoLabel}>Sera</Text>
                  <Text style={styles.infoValue}>{closure.weatherEvening}</Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Coffee Machine */}
        {(closure.coffeeMachineStart || closure.coffeeMachineEnd) && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Macchina Caffe</Text>
            <View style={styles.grid}>
              <View style={styles.gridItem}>
                <Text style={styles.infoLabel}>Lettura Iniziale</Text>
                <Text style={styles.infoValue}>{closure.coffeeMachineStart || '-'}</Text>
              </View>
              <View style={styles.gridItem}>
                <Text style={styles.infoLabel}>Lettura Finale</Text>
                <Text style={styles.infoValue}>{closure.coffeeMachineEnd || '-'}</Text>
              </View>
              <View style={styles.gridItem}>
                <Text style={styles.infoLabel}>Caffe Venduti</Text>
                <Text style={[styles.infoValue, styles.bold]}>{closure.coffeeSold || 0}</Text>
              </View>
            </View>
          </View>
        )}

        {/* Notes */}
        {closure.notes && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Note</Text>
            <Text style={{ lineHeight: 1.5 }}>{closure.notes}</Text>
          </View>
        )}

        {/* Footer */}
        <View style={styles.footer}>
          <Text>Weiss Cafe Gestionale</Text>
          <Text>Generato il {format(new Date(), "dd/MM/yyyy 'alle' HH:mm", { locale: it })}</Text>
          <Text>ID: {closure.id.slice(0, 8)}</Text>
        </View>
      </Page>
    </Document>
  )
}
