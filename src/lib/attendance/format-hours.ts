/**
 * 7.75 → "7h 45m". Arrotonda al minuto, per non mostrare "7h 59m" al posto
 * di 8. In un file proprio perché serve anche ai componenti client: il resto
 * di `timesheet.ts` passa da Prisma e non può entrare in un bundle browser.
 */
export function formatHoursMinutes(hours: number): string {
  const totalMinutes = Math.round(hours * 60)
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60

  return m === 0 ? `${h}h` : `${h}h ${String(m).padStart(2, '0')}m`
}
