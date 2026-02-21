import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { logger } from '@/lib/logger'
import { ScheduleStatus, ScheduleType, SchedulePriority } from '@/types/schedule'
import { getVenueId } from '@/lib/venue'

// GET /api/scadenzario/export - Export CSV scadenze
export async function GET(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)

    const venueId = await getVenueId()

    // Filtri (stessi del GET principale)
    const stato = searchParams.get('stato')
    const tipo = searchParams.get('tipo')
    const priorita = searchParams.get('priorita')
    const search = searchParams.get('search')

    const where: Prisma.ScheduleWhereInput = { venueId }
    if (stato) where.stato = stato as ScheduleStatus
    if (tipo) where.tipo = tipo as ScheduleType
    if (priorita) where.priorita = priorita as SchedulePriority
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
      'Tipo Documento', 'Numero Documento', 'Metodo Pagamento',
    ]

    const rows = schedules.map(s => [
      s.tipo === 'attiva' ? 'Da incassare' : 'Da pagare',
      escapeCsv(s.descrizione),
      escapeCsv(s.controparteNome || s.supplier?.name || ''),
      Number(s.importoTotale).toFixed(2),
      Number(s.importoPagato).toFixed(2),
      (Number(s.importoTotale) - Number(s.importoPagato)).toFixed(2),
      s.stato,
      s.priorita,
      s.dataScadenza ? new Date(s.dataScadenza).toLocaleDateString('it-IT') : '',
      s.dataEmissione ? new Date(s.dataEmissione).toLocaleDateString('it-IT') : '',
      s.tipoDocumento || '',
      escapeCsv(s.numeroDocumento || ''),
      s.metodoPagamento || '',
    ])

    const csv = [
      headers.join(';'),
      ...rows.map(r => r.join(';')),
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
