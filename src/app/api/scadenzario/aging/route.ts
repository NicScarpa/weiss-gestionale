import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { getVenueId } from '@/lib/venue'

interface AgingBand {
  fascia: string
  conteggio: number
  importo_totale: number
  importo_residuo: number
}

const FASCE = [
  { label: '0-15 gg', min: 0, max: 15 },
  { label: '15-30 gg', min: 15, max: 30 },
  { label: '30-60 gg', min: 30, max: 60 },
  { label: '60-90 gg', min: 60, max: 90 },
  { label: '90-120 gg', min: 90, max: 120 },
  { label: '>120 gg', min: 120, max: Infinity },
]

// GET /api/scadenzario/aging - Aging analysis scadenze
export async function GET(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const venueId = await getVenueId()

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    // Recupera tutte le scadenze scadute non pagate e non annullate
    const schedules = await prisma.schedule.findMany({
      where: {
        venueId,
        stato: { notIn: ['pagata', 'annullata'] },
        dataScadenza: { lt: today },
      },
      select: {
        id: true,
        tipo: true,
        dataScadenza: true,
        importoTotale: true,
        importoPagato: true,
      },
    })

    // Calcola giorni scaduti e raggruppa per fascia
    const attiveBands: AgingBand[] = FASCE.map(f => ({
      fascia: f.label,
      conteggio: 0,
      importo_totale: 0,
      importo_residuo: 0,
    }))

    const passiveBands: AgingBand[] = FASCE.map(f => ({
      fascia: f.label,
      conteggio: 0,
      importo_totale: 0,
      importo_residuo: 0,
    }))

    schedules.forEach(s => {
      const giorniScaduti = Math.floor(
        (today.getTime() - new Date(s.dataScadenza).getTime()) / (1000 * 60 * 60 * 24)
      )
      const importoTotale = Number(s.importoTotale)
      const importoResiduo = importoTotale - Number(s.importoPagato)

      const fasciaIdx = FASCE.findIndex(f => giorniScaduti >= f.min && giorniScaduti < f.max)
      if (fasciaIdx === -1) return

      const bands = s.tipo === 'attiva' ? attiveBands : passiveBands
      bands[fasciaIdx].conteggio++
      bands[fasciaIdx].importo_totale += importoTotale
      bands[fasciaIdx].importo_residuo += importoResiduo
    })

    return NextResponse.json({
      attive: attiveBands,
      passive: passiveBands,
    })
  } catch (error) {
    logger.error('Errore GET /api/scadenzario/aging', error)
    return NextResponse.json(
      { error: 'Errore nel calcolo aging' },
      { status: 500 }
    )
  }
}
