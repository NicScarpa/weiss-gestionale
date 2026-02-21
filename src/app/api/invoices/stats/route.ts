import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getVenueId } from '@/lib/venue'

const MONTH_LABELS = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic']

// Document types considered as purchases (passive invoices)
const PURCHASE_DOC_TYPES = ['TD02', 'TD04', 'TD05', 'TD20']

// GET /api/invoices/stats?year=2026&venueId=xxx
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
    const year = parseInt(searchParams.get('year') || String(new Date().getFullYear()))
    const venueId = searchParams.get('venueId') || await getVenueId()

    const startDate = new Date(year, 0, 1)
    const endDate = new Date(year, 11, 31)

    // Fetch all invoices for the year
    const invoices = await prisma.electronicInvoice.findMany({
      where: {
        venueId,
        invoiceDate: {
          gte: startDate,
          lte: endDate,
        },
      },
      select: {
        invoiceDate: true,
        documentType: true,
        netAmount: true,
        vatAmount: true,
        totalAmount: true,
        supplierName: true,
      },
    })

    // Initialize monthly data
    const monthly = MONTH_LABELS.map(mese => ({
      mese,
      ricavi: 0,
      costi: 0,
      aCredito: 0,
      aDebito: 0,
    }))

    const totals = {
      ricavi: 0,
      costi: 0,
      differenza: 0,
      ivaCredito: 0,
      ivaDebito: 0,
      ivaNetta: 0,
    }

    // Aggregate by supplier for top lists
    const clientiMap = new Map<string, number>()
    const fornitoriMap = new Map<string, number>()

    for (const inv of invoices) {
      const month = new Date(inv.invoiceDate).getMonth()
      const net = inv.netAmount?.toNumber() || 0
      const vat = inv.vatAmount?.toNumber() || 0
      const isPurchase = PURCHASE_DOC_TYPES.includes(inv.documentType || '')

      if (isPurchase) {
        // Passive invoice (purchase)
        monthly[month].costi += net
        monthly[month].aDebito += vat
        totals.costi += net
        totals.ivaDebito += vat

        const name = inv.supplierName || 'Sconosciuto'
        fornitoriMap.set(name, (fornitoriMap.get(name) || 0) + net)
      } else {
        // Active invoice (sale)
        monthly[month].ricavi += net
        monthly[month].aCredito += vat
        totals.ricavi += net
        totals.ivaCredito += vat

        const name = inv.supplierName || 'Sconosciuto'
        clientiMap.set(name, (clientiMap.get(name) || 0) + net)
      }
    }

    totals.differenza = totals.ricavi - totals.costi
    totals.ivaNetta = totals.ivaCredito - totals.ivaDebito

    // Top 10 clienti e fornitori
    const topClienti = [...clientiMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([nome, totale]) => ({ nome, totale }))

    const topFornitori = [...fornitoriMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([nome, totale]) => ({ nome, totale }))

    return NextResponse.json({
      monthly,
      totals,
      topClienti,
      topFornitori,
    })
  } catch (error) {
    console.error('Errore GET /api/invoices/stats:', error)
    return NextResponse.json(
      { error: 'Errore nel calcolo delle statistiche' },
      { status: 500 }
    )
  }
}
