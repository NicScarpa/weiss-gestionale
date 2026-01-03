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
    fontSize: 9,
    fontFamily: 'Helvetica',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 15,
    paddingBottom: 10,
    borderBottomWidth: 2,
    borderBottomColor: '#0f172a',
  },
  headerLeft: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontFamily: 'Helvetica-Bold',
    color: '#0f172a',
  },
  subtitle: {
    fontSize: 10,
    color: '#64748b',
    marginTop: 2,
  },
  filterInfo: {
    backgroundColor: '#f8fafc',
    padding: 8,
    borderRadius: 4,
    marginBottom: 15,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  filterItem: {
    marginRight: 20,
    flexDirection: 'row',
  },
  filterLabel: {
    fontSize: 8,
    color: '#64748b',
    marginRight: 4,
  },
  filterValue: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
  },
  table: {
    marginBottom: 15,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#0f172a',
    color: 'white',
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  tableHeaderText: {
    color: 'white',
    fontFamily: 'Helvetica-Bold',
    fontSize: 8,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    paddingVertical: 5,
    paddingHorizontal: 4,
    minHeight: 20,
  },
  tableRowAlt: {
    backgroundColor: '#f8fafc',
  },
  colDate: {
    width: 55,
  },
  colDesc: {
    flex: 1,
    paddingRight: 6,
  },
  colReg: {
    width: 40,
    textAlign: 'center',
  },
  colAccount: {
    width: 70,
  },
  colDebit: {
    width: 60,
    textAlign: 'right',
  },
  colCredit: {
    width: 60,
    textAlign: 'right',
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
    paddingVertical: 4,
  },
  summaryLabel: {
    fontSize: 10,
  },
  summaryValue: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
  },
  saldoPositive: {
    color: '#16a34a',
  },
  saldoNegative: {
    color: '#dc2626',
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
  pageNumber: {
    position: 'absolute',
    bottom: 15,
    right: 30,
    fontSize: 8,
    color: '#94a3b8',
  },
  totalsRow: {
    flexDirection: 'row',
    backgroundColor: '#e2e8f0',
    paddingVertical: 6,
    paddingHorizontal: 4,
    fontFamily: 'Helvetica-Bold',
  },
})

// Format currency helper
function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined || value === 0) return ''
  return new Intl.NumberFormat('it-IT', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value) + ' €'
}

// Props interface
interface JournalEntry {
  id: string
  date: Date
  description: string
  registerType: 'CASH' | 'BANK'
  debitAmount: number | null
  creditAmount: number | null
  documentRef: string | null
  account?: {
    code: string
    name: string
  } | null
  venue?: {
    code: string
    name: string
  } | null
}

interface PrimaNotaPdfProps {
  entries: JournalEntry[]
  registerType: 'CASH' | 'BANK' | 'ALL'
  dateFrom?: string
  dateTo?: string
  totaleDebiti: number
  totaleCrediti: number
  saldoPeriodo: number
}

export function PrimaNotaPdfDocument({
  entries,
  registerType,
  dateFrom,
  dateTo,
  totaleDebiti,
  totaleCrediti,
  saldoPeriodo,
}: PrimaNotaPdfProps) {
  const registerLabel = registerType === 'CASH' ? 'Cassa' : registerType === 'BANK' ? 'Banca' : 'Tutti i registri'

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.title}>Prima Nota</Text>
            <Text style={styles.subtitle}>{registerLabel}</Text>
          </View>
          <View>
            <Text style={{ fontSize: 9, textAlign: 'right' }}>
              {entries.length} movimenti
            </Text>
          </View>
        </View>

        {/* Filter Info */}
        <View style={styles.filterInfo}>
          {dateFrom && (
            <View style={styles.filterItem}>
              <Text style={styles.filterLabel}>Dal:</Text>
              <Text style={styles.filterValue}>{dateFrom}</Text>
            </View>
          )}
          {dateTo && (
            <View style={styles.filterItem}>
              <Text style={styles.filterLabel}>Al:</Text>
              <Text style={styles.filterValue}>{dateTo}</Text>
            </View>
          )}
          <View style={styles.filterItem}>
            <Text style={styles.filterLabel}>Registro:</Text>
            <Text style={styles.filterValue}>{registerLabel}</Text>
          </View>
        </View>

        {/* Summary Box */}
        <View style={styles.summaryBox}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Totale Dare (Entrate)</Text>
            <Text style={[styles.summaryValue, styles.saldoPositive]}>
              {formatCurrency(totaleDebiti) || '0,00 €'}
            </Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Totale Avere (Uscite)</Text>
            <Text style={[styles.summaryValue, styles.saldoNegative]}>
              {formatCurrency(totaleCrediti) || '0,00 €'}
            </Text>
          </View>
          <View style={[styles.summaryRow, { borderTopWidth: 1, borderTopColor: '#cbd5e1', marginTop: 4, paddingTop: 8 }]}>
            <Text style={[styles.summaryLabel, styles.bold]}>Saldo Periodo</Text>
            <Text style={[styles.summaryValue, saldoPeriodo >= 0 ? styles.saldoPositive : styles.saldoNegative]}>
              {saldoPeriodo >= 0 ? '+' : ''}{formatCurrency(saldoPeriodo) || '0,00 €'}
            </Text>
          </View>
        </View>

        {/* Table */}
        <View style={[styles.table, { marginTop: 15 }]}>
          {/* Table Header */}
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderText, styles.colDate]}>Data</Text>
            <Text style={[styles.tableHeaderText, styles.colDesc]}>Descrizione</Text>
            <Text style={[styles.tableHeaderText, styles.colReg, styles.textCenter]}>Reg.</Text>
            <Text style={[styles.tableHeaderText, styles.colAccount]}>Conto</Text>
            <Text style={[styles.tableHeaderText, styles.colDebit, styles.textRight]}>Dare</Text>
            <Text style={[styles.tableHeaderText, styles.colCredit, styles.textRight]}>Avere</Text>
          </View>

          {/* Table Rows */}
          {entries.map((entry, idx) => (
            <View key={entry.id} style={idx % 2 === 1 ? [styles.tableRow, styles.tableRowAlt] : styles.tableRow}>
              <Text style={styles.colDate}>
                {format(new Date(entry.date), 'dd/MM/yy', { locale: it })}
              </Text>
              <Text style={styles.colDesc}>
                {entry.description}
              </Text>
              <Text style={[styles.colReg, styles.textCenter]}>
                {entry.registerType === 'CASH' ? 'C' : 'B'}
              </Text>
              <Text style={styles.colAccount}>
                {entry.account?.code || '-'}
              </Text>
              <Text style={entry.debitAmount ? [styles.colDebit, styles.textRight, styles.saldoPositive] : [styles.colDebit, styles.textRight]}>
                {formatCurrency(entry.debitAmount)}
              </Text>
              <Text style={entry.creditAmount ? [styles.colCredit, styles.textRight, styles.saldoNegative] : [styles.colCredit, styles.textRight]}>
                {formatCurrency(entry.creditAmount)}
              </Text>
            </View>
          ))}

          {/* Totals Row */}
          <View style={styles.totalsRow}>
            <Text style={styles.colDate}></Text>
            <Text style={styles.colDesc}>TOTALI</Text>
            <Text style={styles.colReg}></Text>
            <Text style={styles.colAccount}></Text>
            <Text style={[styles.colDebit, styles.textRight, styles.saldoPositive]}>
              {formatCurrency(totaleDebiti)}
            </Text>
            <Text style={[styles.colCredit, styles.textRight, styles.saldoNegative]}>
              {formatCurrency(totaleCrediti)}
            </Text>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text>Weiss Cafe Gestionale - Prima Nota</Text>
          <Text>Generato il {format(new Date(), "dd/MM/yyyy 'alle' HH:mm", { locale: it })}</Text>
        </View>

        {/* Page Number */}
        <Text
          style={styles.pageNumber}
          render={({ pageNumber, totalPages }) => `Pagina ${pageNumber} di ${totalPages}`}
          fixed
        />
      </Page>
    </Document>
  )
}
