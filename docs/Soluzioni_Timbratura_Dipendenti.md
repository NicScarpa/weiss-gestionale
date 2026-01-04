# Soluzioni per la Timbratura dei Dipendenti

**Documento di Analisi Comparativa**
**Weiss Cafè - Sistema Gestionale**
**Data:** Gennaio 2026

---

## Indice

1. [Introduzione](#introduzione)
2. [Requisiti Specifici Weiss Cafè](#requisiti-specifici-weiss-cafè)
3. [Soluzioni Analizzate](#soluzioni-analizzate)
   - [QR Code Dinamico](#1-qr-code-dinamico)
   - [NFC/RFID Badge](#2-nfcrfid-badge)
   - [Biometria (Impronta Digitale)](#3-biometria-impronta-digitale)
   - [Riconoscimento Facciale](#4-riconoscimento-facciale)
   - [App Mobile con Geolocalizzazione](#5-app-mobile-con-geolocalizzazione)
   - [Beacon Bluetooth](#6-beacon-bluetooth)
   - [PIN su Terminale](#7-pin-su-terminale)
   - [Timbratura Web Manuale](#8-timbratura-web-manuale)
4. [Tabella Comparativa](#tabella-comparativa)
5. [Raccomandazione per Weiss Cafè](#raccomandazione-per-weiss-cafè)
6. [Considerazioni Legali (Italia)](#considerazioni-legali-italia)

---

## Introduzione

La timbratura dei dipendenti è un elemento cruciale per la gestione del personale, il calcolo delle ore lavorate e la conformità normativa. Questo documento analizza le principali soluzioni disponibili sul mercato, valutandone vantaggi, svantaggi, costi e requisiti hardware.

---

## Requisiti Specifici Weiss Cafè

| Requisito | Descrizione |
|-----------|-------------|
| **Sedi multiple** | Weiss Cafè, Villa Varda, Casette |
| **Tipologia personale** | Fissi, extra, intermittenti |
| **Orari** | Turni variabili (06:00 - 03:00) |
| **Ambiente** | Bar/Ristorante (umidità, sporco mani) |
| **Budget** | Da definire |
| **Integrazione** | Sistema gestionale esistente (Next.js/Prisma) |

---

## Soluzioni Analizzate

### 1. QR Code Dinamico

#### Descrizione
Un QR code viene visualizzato su un display in sede e ruota ogni 30-60 secondi. Il dipendente scansiona il codice con il proprio smartphone per registrare entrata/uscita.

#### Come Funziona
1. Un tablet/monitor in sede mostra un QR code che cambia periodicamente
2. Il dipendente apre l'app/PWA aziendale
3. Scansiona il QR code
4. Il sistema registra timestamp + validità del token

#### Pro
- ✅ **Costo hardware basso** - basta un tablet economico
- ✅ **Nessun badge da gestire** - usa smartphone personale
- ✅ **Anti-frode** - QR rotante impedisce screenshot
- ✅ **Facile implementazione** - librerie open source disponibili
- ✅ **Manutenzione minima** - nessuna parte meccanica

#### Contro
- ❌ Richiede smartphone a ogni dipendente
- ❌ Dipendente deve avere app installata
- ❌ Problemi se smartphone scarico/dimenticato
- ❌ Necessita connessione internet (almeno sul display)

#### Costi Stimati

| Voce | Costo |
|------|-------|
| Tablet Android (per sede) | €100-200 |
| Supporto/Stand tablet | €20-50 |
| Sviluppo software | Incluso nel gestionale |
| **Costo totale (3 sedi)** | **€360-750** |
| Costo ricorrente | €0 |

#### Hardware Necessario
- 1x Tablet Android 10"+ per sede (es. Samsung Galaxy Tab A8, Lenovo Tab M10)
- Supporto da parete o bancone
- Alimentatore sempre collegato

---

### 2. NFC/RFID Badge

#### Descrizione
Ogni dipendente riceve un badge con chip NFC/RFID. Avvicinando il badge a un lettore, viene registrata la timbratura.

#### Come Funziona
1. Dipendente avvicina badge al lettore
2. Lettore legge ID univoco del chip
3. Sistema registra timestamp + ID dipendente
4. Feedback sonoro/visivo conferma timbratura

#### Pro
- ✅ **Velocissimo** - meno di 1 secondo
- ✅ **Non richiede smartphone**
- ✅ **Funziona offline** - lettori con buffer locale
- ✅ **Affidabile** - tecnologia consolidata
- ✅ **Igienico** - contactless

#### Contro
- ❌ Badge può essere prestato (buddy punching)
- ❌ Badge smarrito = costo sostituzione
- ❌ Hardware dedicato per sede
- ❌ Gestione inventario badge

#### Costi Stimati

| Voce | Costo |
|------|-------|
| Lettore NFC USB | €30-80 |
| Lettore NFC standalone con display | €150-400 |
| Badge NFC (x20 dipendenti) | €40-100 (€2-5 cad.) |
| Badge sostitutivi/anno | €20-50 |
| **Costo totale iniziale (3 sedi)** | **€550-1.500** |
| Costo ricorrente/anno | €50-100 |

#### Hardware Necessario
- Lettore NFC per sede (USB o standalone)
- Se USB: PC/Raspberry Pi sempre acceso
- Badge NFC MIFARE Classic o NTAG per dipendente
- Opzionale: stampante badge per personalizzazione

#### Prodotti Consigliati
- **Lettore USB**: ACR122U (~€35)
- **Lettore standalone**: TimeMoto TM-616 (~€200)
- **Badge**: MIFARE Classic 1K (~€1-2 cad. in stock)

---

### 3. Biometria (Impronta Digitale)

#### Descrizione
Terminale con sensore di impronte digitali. Il dipendente appoggia il dito per identificarsi e timbrare.

#### Come Funziona
1. Registrazione iniziale: acquisizione 2-3 impronte per dipendente
2. Timbratura: dipendente appoggia dito sul sensore
3. Sistema confronta impronta con database
4. Se match → registra timbratura

#### Pro
- ✅ **Impossibile da falsificare** - no buddy punching
- ✅ **Niente da portare** - il "badge" è il dito
- ✅ **Veloce** - 1-2 secondi
- ✅ **Non si perde/dimentica**

#### Contro
- ❌ **Problematico in bar/ristorante** - mani bagnate, sporche, tagli
- ❌ **Costo hardware elevato**
- ❌ **Privacy** - dati biometrici sensibili (GDPR)
- ❌ **Manutenzione sensore** - pulizia frequente
- ❌ Alcuni dipendenti potrebbero rifiutare

#### Costi Stimati

| Voce | Costo |
|------|-------|
| Terminale biometrico base | €150-300 |
| Terminale biometrico professionale | €400-800 |
| Installazione/configurazione | €50-100 |
| **Costo totale (3 sedi)** | **€600-2.700** |
| Manutenzione/anno | €100-200 |

#### Hardware Necessario
- Terminale biometrico per sede
- Connessione di rete (LAN o WiFi)
- Posizione protetta da umidità

#### Prodotti Consigliati
- **Entry level**: ZKTeco K40 (~€180)
- **Professionale**: Anviz EP300 (~€350)
- **Premium**: Suprema BioStation 2 (~€700)

#### ⚠️ Nota GDPR
I dati biometrici sono considerati "dati particolari" (art. 9 GDPR). Richiesto:
- Consenso esplicito scritto del dipendente
- Valutazione d'impatto (DPIA)
- Misure di sicurezza adeguate
- Informativa privacy specifica

---

### 4. Riconoscimento Facciale

#### Descrizione
Terminale con telecamera che identifica il dipendente tramite il volto.

#### Come Funziona
1. Registrazione: acquisizione volto da più angolazioni
2. Timbratura: dipendente si posiziona davanti alla telecamera
3. AI confronta volto con database
4. Se match → registra timbratura

#### Pro
- ✅ **Completamente contactless**
- ✅ **Impossibile buddy punching**
- ✅ **Veloce** - riconoscimento in <1 secondo
- ✅ **Può funzionare con mascherina** (modelli recenti)
- ✅ **Igienico** - nessun contatto

#### Contro
- ❌ **Costo molto elevato**
- ❌ **Privacy** - stesse problematiche biometria
- ❌ **Illuminazione** - richiede luce adeguata
- ❌ **False reiezioni** - occhiali, barba, trucco
- ❌ **Percezione negativa** - "Grande Fratello"

#### Costi Stimati

| Voce | Costo |
|------|-------|
| Terminale riconoscimento facciale | €300-1.000 |
| Terminale professionale con AI | €800-2.000 |
| **Costo totale (3 sedi)** | **€900-6.000** |
| Licenze software/anno (alcuni) | €0-200 |

#### Hardware Necessario
- Terminale con telecamera IR per sede
- Illuminazione adeguata (no controluce)
- Connessione di rete

#### Prodotti Consigliati
- **Entry level**: ZKTeco SpeedFace V5L (~€400)
- **Professionale**: Hikvision DS-K1T671M (~€600)
- **Premium**: Suprema FaceStation F2 (~€1.200)

---

### 5. App Mobile con Geolocalizzazione

#### Descrizione
App installata sullo smartphone del dipendente che verifica la posizione GPS al momento della timbratura.

#### Come Funziona
1. Dipendente apre app sul proprio smartphone
2. Preme "Timbra entrata" o "Timbra uscita"
3. App acquisisce coordinate GPS
4. Sistema verifica che coordinate siano nel raggio della sede
5. Se dentro geofence → registra timbratura

#### Pro
- ✅ **Costo hardware zero** - usa smartphone dipendente
- ✅ **Perfetto per sedi multiple** - automatico
- ✅ **Ideale per eventi esterni** (Villa Varda, catering)
- ✅ **Storico posizioni** per verifiche
- ✅ **Facile da implementare** come PWA

#### Contro
- ❌ **GPS manipolabile** - app fake GPS (mitigabile)
- ❌ **Richiede smartphone con GPS**
- ❌ **Consuma batteria**
- ❌ **Privacy** - tracciamento posizione
- ❌ **GPS impreciso indoor** - errore 5-20 metri

#### Costi Stimati

| Voce | Costo |
|------|-------|
| Sviluppo PWA/App | Incluso nel gestionale |
| Hardware | €0 |
| **Costo totale** | **€0** |
| Costo ricorrente | €0 |

#### Hardware Necessario
- Nessuno (usa smartphone dipendenti)

#### Configurazione Consigliata
```
Geofence:
- Weiss Cafè: lat/long centro + raggio 50m
- Villa Varda: lat/long centro + raggio 100m
- Casette: lat/long centro + raggio 30m

Anti-frode:
- Verifica GPS non mockato
- Foto selfie opzionale
- Blocco VPN/proxy
```

---

### 6. Beacon Bluetooth

#### Descrizione
Piccoli dispositivi Bluetooth (beacon) posizionati in sede. Lo smartphone del dipendente rileva automaticamente la presenza.

#### Come Funziona
1. Beacon trasmette segnale Bluetooth a bassa energia (BLE)
2. App sul telefono rileva beacon quando in prossimità
3. Timbratura automatica o con conferma manuale
4. Sistema registra timestamp + beacon rilevato

#### Pro
- ✅ **Preciso indoor** - meglio del GPS
- ✅ **Automatizzabile** - timbratura senza azione
- ✅ **Basso consumo** - beacon durano 2-5 anni
- ✅ **Economico** - beacon costano poco

#### Contro
- ❌ **Richiede Bluetooth sempre attivo**
- ❌ **Raggio limitato** - 10-30 metri
- ❌ **Interferenze** - altri dispositivi BLE
- ❌ **Smartphone necessario**
- ❌ **Setup più complesso**

#### Costi Stimati

| Voce | Costo |
|------|-------|
| Beacon BLE (x2 per sede) | €40-100 (€15-30 cad.) |
| Sviluppo integrazione | Incluso nel gestionale |
| **Costo totale (3 sedi)** | **€120-300** |
| Batterie sostitutive/anno | €20-40 |

#### Hardware Necessario
- 1-2 Beacon BLE per sede (ridondanza)
- Smartphone dipendenti con BLE

#### Prodotti Consigliati
- **Economici**: Estimote Proximity Beacons (~€25 cad.)
- **Affidabili**: Kontakt.io Smart Beacon (~€30 cad.)
- **Industriali**: BlueUp Maxi Beacon (~€40 cad.)

---

### 7. PIN su Terminale

#### Descrizione
Terminale con tastierino numerico. Ogni dipendente ha un PIN personale per timbrare.

#### Come Funziona
1. Dipendente si avvicina al terminale
2. Digita il proprio PIN (4-6 cifre)
3. Preme conferma
4. Sistema registra timbratura

#### Pro
- ✅ **Semplicissimo** - nessuna formazione necessaria
- ✅ **Economico** - terminali a basso costo
- ✅ **Nessun badge/smartphone**
- ✅ **Veloce** - pochi secondi
- ✅ **Affidabile** - nessun problema tecnico

#### Contro
- ❌ **PIN condivisibile** - buddy punching facile
- ❌ **PIN dimenticato** - reset frequenti
- ❌ **Coda** - digitazione richiede tempo
- ❌ **Igiene** - tastiera condivisa

#### Costi Stimati

| Voce | Costo |
|------|-------|
| Terminale con tastiera | €100-300 |
| Terminale touchscreen | €200-500 |
| **Costo totale (3 sedi)** | **€300-1.500** |
| Manutenzione/anno | €50-100 |

#### Hardware Necessario
- Terminale con display e tastiera per sede
- Connessione di rete
- Opzionale: display per feedback

---

### 8. Timbratura Web Manuale

#### Descrizione
Semplice interfaccia web accessibile da browser dove il dipendente clicca per timbrare.

#### Come Funziona
1. Dipendente accede al portale (già esistente)
2. Clicca "Timbra entrata" o "Timbra uscita"
3. Sistema registra timestamp + IP
4. Opzionale: richiede conferma sede

#### Pro
- ✅ **Costo zero** - già abbiamo il portale
- ✅ **Nessun hardware aggiuntivo**
- ✅ **Accessibile ovunque**
- ✅ **Immediato da implementare**
- ✅ **Backup per altri sistemi**

#### Contro
- ❌ **Nessuna verifica presenza** - timbrabile da casa
- ❌ **Basato sulla fiducia**
- ❌ **Nessun deterrente frodi**
- ❌ **Non adatto come sistema primario**

#### Costi Stimati

| Voce | Costo |
|------|-------|
| Sviluppo | Incluso nel gestionale |
| Hardware | €0 |
| **Costo totale** | **€0** |

#### Uso Consigliato
- Backup quando altri sistemi non funzionano
- Correzioni manuali da parte del manager
- Sedi temporanee/eventi

---

## Tabella Comparativa

| Soluzione | Costo Iniziale | Costo/Anno | Anti-Frode | Velocità | Manutenzione | Adatto Bar |
|-----------|----------------|------------|------------|----------|--------------|------------|
| **QR Code Dinamico** | €400-750 | €0 | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **NFC Badge** | €550-1.500 | €50-100 | ⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| **Impronta Digitale** | €600-2.700 | €100-200 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐ |
| **Riconoscimento Facciale** | €900-6.000 | €0-200 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ |
| **GPS Mobile** | €0 | €0 | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **Beacon Bluetooth** | €120-300 | €20-40 | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| **PIN Terminale** | €300-1.500 | €50-100 | ⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ |
| **Web Manuale** | €0 | €0 | ⭐ | ⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐ |

---

## Raccomandazione per Weiss Cafè

### Soluzione Consigliata: Ibrida QR Code + GPS

Data la natura dell'attività (bar/ristorante, mani spesso occupate/sporche, sedi multiple, eventi esterni), consiglio un **sistema ibrido**:

#### Sistema Primario: QR Code Dinamico
- **Dove**: Weiss Cafè (sede principale)
- **Perché**:
  - Costo contenuto
  - Nessun contatto (igienico)
  - Anti-frode (QR rotante)
  - Facile da usare

#### Sistema Secondario: GPS Mobile
- **Dove**: Villa Varda, Casette, eventi esterni
- **Perché**:
  - Sedi senza infrastruttura fissa
  - Eventi in location diverse
  - Costo zero

#### Backup: Timbratura Web
- **Quando**: Smartphone scarico, problemi tecnici
- **Chi**: Solo con autorizzazione manager

### Configurazione Proposta

```
┌─────────────────────────────────────────────────────────┐
│                    WEISS CAFÈ                           │
│  ┌─────────────┐                                        │
│  │   Tablet    │  ← QR Code rotante ogni 30 sec        │
│  │  (ingresso) │                                        │
│  └─────────────┘                                        │
│                                                         │
│  Dipendente → Apre PWA → Scansiona QR → Timbrato!     │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│              VILLA VARDA / CASETTE / EVENTI            │
│                                                         │
│  Dipendente → Apre PWA → Timbra con GPS → Verificato! │
│                                                         │
│  Geofence: 50-100m dal centro sede                     │
└─────────────────────────────────────────────────────────┘
```

### Budget Stimato

| Voce | Costo |
|------|-------|
| Tablet Weiss Cafè | €150 |
| Supporto tablet | €30 |
| Sviluppo (già previsto) | €0 |
| **Totale** | **€180** |

---

## Considerazioni Legali (Italia)

### Normativa Applicabile

1. **Statuto dei Lavoratori (L. 300/1970)**
   - Art. 4: Controllo a distanza dei lavoratori
   - Richiede accordo sindacale o autorizzazione ITL

2. **GDPR (Reg. UE 2016/679)**
   - Informativa privacy obbligatoria
   - Base giuridica: esecuzione contratto di lavoro
   - Per biometria: consenso esplicito + DPIA

3. **Jobs Act (D.Lgs. 151/2015)**
   - Semplificazione controlli su strumenti di lavoro
   - Timbratura = strumento di lavoro (no accordo se solo registrazione orario)

### Adempimenti Obbligatori

| Adempimento | QR/GPS | Badge | Biometria |
|-------------|--------|-------|-----------|
| Informativa privacy | ✅ Sì | ✅ Sì | ✅ Sì |
| Accordo sindacale/ITL | ❌ No* | ❌ No* | ⚠️ Consigliato |
| DPIA | ❌ No | ❌ No | ✅ Obbligatoria |
| Consenso esplicito | ❌ No | ❌ No | ✅ Obbligatorio |
| Registro trattamenti | ✅ Sì | ✅ Sì | ✅ Sì |

*Se il sistema registra SOLO orario entrata/uscita senza altre funzionalità di controllo.

### Template Informativa Privacy

L'informativa deve includere:
- Titolare del trattamento
- Finalità (gestione presenze, calcolo retribuzione)
- Base giuridica
- Tempo di conservazione (5 anni per buste paga)
- Diritti dell'interessato
- Eventuali trasferimenti dati

---

## Conclusioni

Per Weiss Cafè, la soluzione **QR Code Dinamico + GPS** offre il miglior rapporto qualità/prezzo:

- ✅ Costo iniziale minimo (~€180)
- ✅ Nessun costo ricorrente
- ✅ Adatto all'ambiente bar (mani sporche, velocità)
- ✅ Flessibile per eventi esterni
- ✅ Anti-frode efficace
- ✅ Già integrabile nel gestionale esistente
- ✅ Conformità GDPR semplice (no biometria)

La biometria, sebbene più sicura, è sconsigliata per:
- Ambiente umido/sporco del bar
- Complessità GDPR
- Costo elevato
- Possibile resistenza dipendenti

---

*Documento redatto il 4 Gennaio 2026*
*Prossima revisione: Prima dell'implementazione Fase 4.4*
