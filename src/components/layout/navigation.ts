import {
  LayoutDashboard,
  Receipt,
  BookOpen,
  FileText,
  BarChart3,
  Settings,
  Users,
  CreditCard,
  RefreshCw,
  CalendarClock,
  ListChecks,
  Megaphone,
  type LucideIcon,
} from 'lucide-react'

export interface NavSubItem {
  name: string
  href: string
  icon?: LucideIcon
}

export interface NavSection {
  title: string
  items: NavSubItem[]
}

export interface NavItem {
  name: string
  /** Assente per le voci che aprono solo un sottomenu (es. Personale). */
  href?: string
  icon: LucideIcon
  sections?: NavSection[]
}

/**
 * Navigazione di admin e manager. Vive qui, e non dentro `sidebar.tsx`, perché
 * la usano tre punti — la rail, il pannello a comparsa e il cassetto mobile —
 * e la filtratura per ruolo deve avvenire una volta sola: quando il menu era
 * duplicato, la rail filtrava per ruolo ma il pannello a comparsa leggeva
 * sempre la lista completa, e allo staff che apriva la chiusura cassa si
 * apriva il sottomenu della prima nota.
 */
export const NAV_COMPLETA: NavItem[] = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  {
    name: 'Prima Nota',
    href: '/prima-nota/movimenti',
    icon: BookOpen,
    sections: [
      {
        title: 'Contabilità',
        items: [
          { name: 'Movimenti', href: '/prima-nota/movimenti', icon: BookOpen },
          { name: 'Pagamenti', href: '/prima-nota/pagamenti', icon: CreditCard },
          { name: 'Regole', href: '/prima-nota/regole', icon: ListChecks },
          { name: 'Riconciliazione', href: '/riconciliazione', icon: RefreshCw },
          { name: 'Chiusure Cassa', href: '/chiusura-cassa', icon: Receipt },
        ],
      },
    ],
  },
  {
    name: 'Fatturazione',
    href: '/fatture',
    icon: FileText,
    sections: [
      {
        title: 'Documenti',
        items: [
          { name: 'Fatture', href: '/fatture' },
          { name: 'Prodotti', href: '/prodotti' },
        ],
      },
      {
        title: 'Configurazione',
        items: [
          { name: 'Fornitori', href: '/anagrafiche/fornitori' },
          { name: 'Clienti', href: '/anagrafiche/clienti' },
        ],
      },
    ],
  },
  {
    name: 'Budget',
    href: '/budget',
    icon: BarChart3,
    sections: [
      {
        title: 'Analisi',
        items: [
          { name: 'Situazione', href: '/budget' },
          { name: 'Cash Flow', href: '/cash-flow' },
          { name: 'Prospetto', href: '/cash-flow/prospetto' },
          { name: 'Report', href: '/report' },
        ],
      },
      {
        title: 'Configurazione',
        items: [
          // Le spese ricorrenti alimentano la previsione di cassa: senza una
          // voce di menu il loro CRUD è rimasto per mesi irraggiungibile.
          { name: 'Spese Ricorrenti', href: '/spese-ricorrenti' },
          { name: 'Settings Budget', href: '/impostazioni/budget' },
        ],
      },
    ],
  },
  {
    name: 'Personale',
    icon: Users,
    sections: [
      {
        title: 'Anagrafiche',
        items: [
          { name: 'Dipendenti', href: '/anagrafiche/personale' },
          { name: 'Livelli di Accesso', href: '/anagrafiche/utenti' },
        ],
      },
      {
        title: 'Gestione',
        items: [
          { name: 'Turni', href: '/turni' },
          { name: 'Ferie/Permessi', href: '/ferie-permessi' },
          { name: 'Presenze', href: '/presenze' },
          { name: 'Documenti', href: '/documenti-dipendenti' },
          { name: 'Comunicazioni', href: '/comunicazioni', icon: Megaphone },
        ],
      },
    ],
  },
  {
    name: 'Scadenzario',
    href: '/scadenzario',
    icon: CalendarClock,
  },
  {
    name: 'Impostazioni',
    href: '/impostazioni/generali',
    icon: Settings,
    sections: [
      {
        title: 'Configurazione',
        items: [
          { name: 'Generali', href: '/impostazioni/generali' },
          { name: 'Piano dei conti', href: '/impostazioni/conti' },
          { name: 'Banche e Conti', href: '/impostazioni/banche-e-conti' },
          { name: 'Budget', href: '/impostazioni/budget' },
        ],
      },
      {
        title: 'Anagrafiche',
        items: [{ name: 'Anagrafiche', href: '/anagrafiche' }],
      },
    ],
  },
]

/**
 * Voci visibili allo staff: può compilare la chiusura cassa, ma non ha
 * accesso al resto della dashboard (le API finanziarie gli rispondono 403 e il
 * layout di `(dashboard)` lo rimanda al portale).
 */
export const NAV_STAFF: NavItem[] = [
  { name: 'Chiusure Cassa', href: '/chiusura-cassa', icon: Receipt },
  { name: 'Portale', href: '/portale', icon: Users },
]

/** Nome della voce ancorata in fondo alla rail. */
export const VOCE_IN_FONDO = 'Impostazioni'

/**
 * Il menu che spetta a un ruolo. Il ruolo arriva dal server (`auth()` nel
 * layout), non da `useSession()`: la sessione lato client non è disponibile al
 * primo render, e con un ruolo `undefined` il menu completo comparirebbe per
 * un istante anche allo staff.
 */
export function navigazionePerRuolo(role: string): NavItem[] {
  return role === 'staff' ? NAV_STAFF : NAV_COMPLETA
}
