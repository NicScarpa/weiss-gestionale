# Prompt - Riposizionamento Azioni Rapide nella Dashboard

## Istruzioni per Claude Code

Devi modificare il componente dashboard del gestionale Weiss Cafe per spostare le "Azioni Rapide" da fondo pagina a una posizione prominente in alto, visibile senza scroll.

Il progetto si trova in `/Users/nicolascarpa/Desktop/accounting`.

---

## Contesto Tecnico

- **Framework**: Next.js 16 con App Router, React 19, TypeScript
- **UI**: shadcn/ui (Radix UI) + TailwindCSS 4
- **Icone**: Lucide React (gia importato)
- **Componenti disponibili**: Button, Card, Badge, Tooltip, Link (da next/link)

---

## File da Modificare

**UNICO file**: `src/app/(dashboard)/DashboardClient.tsx` (545 righe)

---

## Cosa Fare - Istruzioni Precise

### 1. Modifica la sezione Welcome (righe 169-178)

**CODICE ATTUALE** (righe 169-178):
```tsx
{/* Welcome Section */}
<div>
  <h1 className="text-2xl font-bold tracking-tight">
    Benvenuto, {userName}
  </h1>
  <p className="text-muted-foreground">
    Ecco un riepilogo delle attività{' '}
    {data?.meta.currentMonth && `- ${data.meta.currentMonth}`}
  </p>
</div>
```

**SOSTITUISCI CON**:
```tsx
{/* Welcome Section + Quick Actions */}
<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
  <div>
    <h1 className="text-2xl font-bold tracking-tight">
      Benvenuto, {userName}
    </h1>
    <p className="text-muted-foreground">
      Ecco un riepilogo delle attività{' '}
      {data?.meta.currentMonth && `- ${data.meta.currentMonth}`}
    </p>
  </div>
  <div className="flex flex-wrap gap-2 shrink-0">
    <Button asChild size="sm">
      <Link href="/chiusura-cassa/nuova">
        <Receipt className="h-4 w-4 mr-2" />
        Nuova Chiusura
      </Link>
    </Button>
    <Button asChild variant="outline" size="sm">
      <Link href="/prima-nota">
        <BookOpen className="h-4 w-4 mr-2" />
        Prima Nota
      </Link>
    </Button>
    <Button asChild variant="outline" size="sm">
      <Link href="/report">
        <TrendingUp className="h-4 w-4 mr-2" />
        Report
      </Link>
    </Button>
  </div>
</div>
```

**Note sul design**:
- `sm:flex-row sm:items-center sm:justify-between`: Su desktop i pulsanti sono a destra del titolo, sulla stessa riga
- Su mobile (`< 640px`): I pulsanti vanno sotto il titolo, allineati a sinistra
- `shrink-0` sul container pulsanti: impedisce ai pulsanti di comprimersi
- `flex-wrap gap-2`: Se i pulsanti non entrano in una riga (schermi molto stretti), vanno a capo ordinatamente
- "Nuova Chiusura" usa `variant="default"` (il piu prominente, sfondo scuro) perche e' l'azione primaria piu frequente
- "Prima Nota" e "Report" usano `variant="outline"` come azioni secondarie

**Assicurati** che il componente `Button` sia gia importato dal file. Controlla gli import in cima al file (riga 6):
```tsx
import { Button } from '@/components/ui/button'
```
Se manca, aggiungilo. (Nota: dalla lettura del codice e' gia presente alla riga 6)

---

### 2. Rimuovi la sezione Azioni Rapide dalla posizione originale (righe 419-473)

**CODICE DA ELIMINARE** (la Card "Azioni Rapide", righe 421-473):
```tsx
<Card>
  <CardHeader>
    <CardTitle>Azioni Rapide</CardTitle>
    <CardDescription>Operazioni frequenti</CardDescription>
  </CardHeader>
  <CardContent className="space-y-2">
    <Link href="/chiusura-cassa/nuova" ... >
      ...
    </Link>
    <Link href="/prima-nota" ... >
      ...
    </Link>
    <Link href="/report" ... >
      ...
    </Link>
  </CardContent>
</Card>
```

---

### 3. Modifica il wrapper della sezione 5 (righe 419-541)

**CODICE ATTUALE** (riga 419-420 + 541):
```tsx
{/* Quick Actions & Recent */}
<div className="grid gap-4 md:grid-cols-2">
  <Card> {/* Azioni Rapide - DA RIMUOVERE */}
    ...
  </Card>
  <Card> {/* Ultime Chiusure - DA TENERE */}
    ...
  </Card>
</div>
```

**SOSTITUISCI CON** (solo la Card Ultime Chiusure, senza grid a 2 colonne):
```tsx
{/* Ultime Chiusure */}
<Card>
  <CardHeader>
    <CardTitle>Ultime Chiusure</CardTitle>
    <CardDescription>Chiusure cassa recenti</CardDescription>
  </CardHeader>
  <CardContent>
    {isLoading ? (
      <div className="space-y-2">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    ) : data?.closures.recent.length === 0 ? (
      <div className="flex items-center justify-center h-32 text-muted-foreground">
        Nessuna chiusura registrata
      </div>
    ) : (
      <div className="space-y-2">
        {data?.closures.recent.map((closure) => (
          <Link
            key={closure.id}
            href={`/chiusura-cassa/${closure.id}`}
            className="flex items-center justify-between p-2 rounded hover:bg-slate-50 transition-colors"
          >
            <div>
              <span className="font-medium">{closure.dateFormatted}</span>
              <span className="text-sm text-muted-foreground ml-2">
                {closure.venue.code}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">
                {formatCurrency(closure.totalIncome)}
              </span>
              <Badge
                variant={
                  closure.status === 'VALIDATED'
                    ? 'default'
                    : closure.status === 'SUBMITTED'
                    ? 'secondary'
                    : 'outline'
                }
                className={
                  closure.status === 'VALIDATED'
                    ? 'bg-green-600'
                    : ''
                }
              >
                {closure.status === 'VALIDATED'
                  ? 'OK'
                  : closure.status === 'SUBMITTED'
                  ? 'Inviata'
                  : 'Bozza'}
              </Badge>
            </div>
          </Link>
        ))}
        <Button variant="ghost" className="w-full mt-2" asChild>
          <Link href="/chiusura-cassa">
            Vedi tutte <ArrowRight className="h-4 w-4 ml-2" />
          </Link>
        </Button>
      </div>
    )}
  </CardContent>
</Card>
```

**IMPORTANTE**: La Card "Ultime Chiusure" resta IDENTICA al codice attuale. L'unica differenza e' che il wrapper `<div className="grid gap-4 md:grid-cols-2">` viene rimosso perche ora c'e' una sola card.

---

### 4. Pulizia import (se necessario)

Controlla se dopo le modifiche ci sono import inutilizzati. In particolare verifica:
- `ArrowRight` (riga 16): e' ancora usato nella sezione "Ultime Chiusure" riga 534, quindi **MANTIENI l'import**
- `CardDescription` (riga 4): e' ancora usato in piu punti, **MANTIENI**

Non ci dovrebbero essere import da rimuovere, ma verifica comunque.

---

## Verifica Finale

Dopo le modifiche:

1. **Build**: Esegui `npm run build` e verifica zero errori TypeScript
2. **Layout Desktop**: Il titolo "Benvenuto" deve essere a sinistra e i 3 pulsanti a destra, sulla stessa riga
3. **Layout Mobile**: Il titolo "Benvenuto" deve essere sopra e i 3 pulsanti sotto, in riga orizzontale
4. **No scroll**: I 3 pulsanti devono essere visibili immediatamente all'apertura della pagina su qualsiasi dispositivo
5. **Navigazione**: Tutti e 3 i link devono funzionare:
   - "Nuova Chiusura" -> `/chiusura-cassa/nuova`
   - "Prima Nota" -> `/prima-nota`
   - "Report" -> `/report`
6. **Ultime Chiusure**: La sezione deve occupare tutta la larghezza (non piu meta schermo)
7. **Nessun errore console**: Controlla che non ci siano warning o errori React nella console browser

---

## Riepilogo Operazioni

| # | Operazione | Righe | Tipo |
|---|-----------|-------|------|
| 1 | Sostituisci Welcome Section con Welcome + Quick Actions | 169-178 | Replace |
| 2 | Rimuovi Card Azioni Rapide | 421-473 | Delete |
| 3 | Rimuovi wrapper grid 2 colonne dalla sezione 5 | 419-420, 541 | Modify |
| 4 | Verifica import | 1-22 | Check |

**Totale**: ~30 righe aggiunte, ~55 righe rimosse, 1 solo file modificato.
