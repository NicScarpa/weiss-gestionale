import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { logger } from '@/lib/logger'
import { ScheduleStatus, ScheduleType, SchedulePriority, ScheduleSource, SCHEDULE_SOURCE_LABELS } from '@/types/schedule'
import { getVenueId } from '@/lib/venue'
import { formatNumeroCsv } from '@/lib/formatters'
import { sumMoney, toApi } from '@/lib/money'

// GET /api/scadenzario/export - Export CSV scadenze
export async function GET(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    if (session.user.role !== 'admin' && session.user.role !== 'manager') {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)

    const venueId = await getVenueId()

    // Filtri (stessi del GET principale)
    const stato = searchParams.get('stato')
    const tipo = searchParams.get('tipo')
    const priorita = searchParams.get('priorita')
    const sourceParam = searchParams.get('source')
    const source = Object.values(ScheduleSource).includes(sourceParam as ScheduleSource)
      ? (sourceParam as ScheduleSource)
      : null
    const search = searchParams.get('search')

    const where: Prisma.ScheduleWhereInput = { venueId }
    if (stato) where.stato = stato as ScheduleStatus
    if (tipo) where.tipo = tipo as ScheduleType
    if (priorita) where.priorita = priorita as SchedulePriority
    if (source) where.source = source
    if (search) {
      where.OR = [
        { descrizione: { contains: search, mode: 'insensitive' } },
        { controparteNome: { contains: search, mode: 'insensitive' } },
        { numeroDocumento: { contains: search, mode: 'insensitive' } },
      ]
    }

    const schedules = await prisma.schedule.findMany({
      where,
      orderBy: { dataScadenza: 'asc' },
      include: {
        supplier: { select: { name: true } },
      },
    })

    // Generate CSV
    const headers = [
      'Tipo', 'Descrizione', 'Controparte', 'Importo Totale', 'Importo Pagato',
      'Residuo', 'Stato', 'Priorità', 'Data Scadenza', 'Data Emissione',
      'Tipo Documento', 'Numero Documento', 'Metodo Pagamento', 'Origine',
    ]

    const rows = schedules.map(s => [
      s.tipo === 'attiva' ? 'Da incassare' : 'Da pagare',
      escapeCsv(s.descrizione),
      escapeCsv(s.controparteNome || s.supplier?.name || ''),
      formatNumeroCsv(Number(s.importoTotale)),
      formatNumeroCsv(Number(s.importoPagato)),
      formatNumeroCsv(Number(s.importoTotale) - Number(s.importoPagato)),
      s.stato,
      s.priorita,
      s.dataScadenza ? new Date(s.dataScadenza).toLocaleDateString('it-IT') : '',
      s.dataEmissione ? new Date(s.dataEmissione).toLocaleDateString('it-IT') : '',
      s.tipoDocumento || '',
      escapeCsv(s.numeroDocumento || ''),
      s.metodoPagamento || '',
      SCHEDULE_SOURCE_LABELS[s.source as ScheduleSource] || s.source || '',
    ])

    // L'export vale quanto la schermata, non meno: chi lo apre deve trovarci
    // anche gli aggregati che la pagina mostra in testata. È un'aggregazione
    // su più righe, quindi aritmetica intermedia: si somma in `Money`
    // (`sumMoney`) e si converte a `number` una sola volta, con `toApi`,
    // solo dove il valore entra in `formatNumeroCsv`.
    const totaleImporto = sumMoney(schedules.map(s => s.importoTotale))
    const totalePagato = sumMoney(schedules.map(s => s.importoPagato))
    const totaleResiduo = totaleImporto.minus(totalePagato)

    const rigaTotali = [
      `TOTALE (${schedules.length} scadenze)`,
      '', '',
      formatNumeroCsv(toApi(totaleImporto)),
      formatNumeroCsv(toApi(totalePagato)),
      formatNumeroCsv(toApi(totaleResiduo)),
      '', '', '', '', '', '', '', '',
    ]

    const csv = [
      headers.join(';'),
      ...rows.map(r => r.join(';')),
      rigaTotali.join(';'),
    ].join('\n')

    // BOM for Excel compatibility
    const bom = '\uFEFF'

    return new NextResponse(bom + csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="scadenzario_${new Date().toISOString().split('T')[0]}.csv"`,
      },
    })
  } catch (error) {
    logger.error('Errore GET /api/scadenzario/export', error)
    return NextResponse.json(
      { error: 'Errore nell\'esportazione' },
      { status: 500 }
    )
  }
}

function escapeCsv(value: string): string {
  if (value.includes(';') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}
