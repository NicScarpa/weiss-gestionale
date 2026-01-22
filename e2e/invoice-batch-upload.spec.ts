import { test, expect } from '@playwright/test'
import { loginAsAdmin } from './helpers/auth'

const createMockInvoiceXml = (number: string, supplier: string, vat: string, amount: string) => `
<?xml version="1.0" encoding="UTF-8"?>
<p:FatturaElettronica versione="FPR12" xmlns:p="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2">
  <FatturaElettronicaHeader>
    <DatiTrasmissione>
      <IdTrasmittente><IdPaese>IT</IdPaese><IdCodice>12345678901</IdCodice></IdTrasmittente>
      <ProgressivoInvio>00001</ProgressivoInvio>
      <FormatoTrasmissione>FPR12</FormatoTrasmissione>
      <CodiceDestinatario>0000000</CodiceDestinatario>
    </DatiTrasmissione>
    <CedentePrestatore>
      <DatiAnagrafici>
        <IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>${vat}</IdCodice></IdFiscaleIVA>
        <Anagrafica><Denominazione>${supplier}</Denominazione></Anagrafica>
      </DatiAnagrafici>
      <Sede><Indirizzo>Via Roma 1</Indirizzo><CAP>00100</CAP><Comune>Roma</Comune><Provincia>RM</Provincia><Nazione>IT</Nazione></Sede>
    </CedentePrestatore>
    <CessionarioCommittente>
      <DatiAnagrafici>
        <IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>00000000000</IdFiscaleIVA>
        <Anagrafica><Denominazione>Weiss Cafe</Denominazione></Anagrafica>
      </DatiAnagrafici>
      <Sede><Indirizzo>Via Venezia 1</Indirizzo><CAP>33077</CAP><Comune>Sacile</Comune><Provincia>PN</Provincia><Nazione>IT</Nazione></Sede>
    </CessionarioCommittente>
  </FatturaElettronicaHeader>
  <FatturaElettronicaBody>
    <DatiGenerali>
      <DatiGeneraliDocumento>
        <TipoDocumento>TD01</TipoDocumento>
        <Divisa>EUR</Divisa>
        <Data>2023-01-01</Data>
        <Numero>${number}</Numero>
        <ImportoTotaleDocumento>${amount}</ImportoTotaleDocumento>
      </DatiGeneraliDocumento>
    </DatiGenerali>
    <DatiBeniServizi>
      <DettaglioLinee>
        <NumeroLinea>1</NumeroLinea>
        <Descrizione>Servizio</Descrizione>
        <PrezzoUnitario>${amount}</PrezzoUnitario>
        <PrezzoTotale>${amount}</PrezzoTotale>
        <AliquotaIVA>22.00</AliquotaIVA>
      </DettaglioLinee>
      <DatiRiepilogo>
        <AliquotaIVA>22.00</AliquotaIVA>
        <ImponibileImporto>${(parseFloat(amount) / 1.22).toFixed(2)}</ImponibileImporto>
        <Imposta>${(parseFloat(amount) - parseFloat(amount) / 1.22).toFixed(2)}</Imposta>
        <EsigibilitaIVA>I</EsigibilitaIVA>
      </DatiRiepilogo>
    </DatiBeniServizi>
  </FatturaElettronicaBody>
</p:FatturaElettronica>
`

test.describe('Batch Invoice Upload', () => {
  test('should handle batch upload with mixed statuses', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/fatture')

    // Click Import button
    await page.getByRole('button', { name: 'Importa Fattura' }).click()

    // Create mock files
    const xml1 = createMockInvoiceXml('INV-001', 'Existing Supplier', 'IT12345678901', '100.00')
    const xml2 = createMockInvoiceXml('INV-002', 'New Supplier', 'IT98765432109', '200.00')

    const buffer1 = Buffer.from(xml1)
    const buffer2 = Buffer.from(xml2)

    // Setup file chooser for batch upload
    // Note: We use the hidden input's id or handle the file chooser event on the upload area
    const fileChooserPromise = page.waitForEvent('filechooser')
    // Click on the upload area or the hidden input label if exposed, 
    // or evaluate script to click hidden input. 
    // In our component: onClick={() => document.getElementById('file-input')?.click()}
    await page.getByText('Trascina qui i file XML o P7M').click() 
    const fileChooser = await fileChooserPromise
    
    await fileChooser.setFiles([
      { name: 'invoice1.xml', mimeType: 'text/xml', buffer: buffer1 },
      { name: 'invoice2.xml', mimeType: 'text/xml', buffer: buffer2 },
    ])

    // Verify files are listed
    await expect(page.getByText('2 file selezionati')).toBeVisible()
    await expect(page.getByText('invoice1.xml')).toBeVisible()
    await expect(page.getByText('invoice2.xml')).toBeVisible()

    // Start Import
    await page.getByRole('button', { name: 'Avvia Importazione' }).click()

    // Wait for "Elaborazione file..." or "Revisione"
    // If dialog closes, this will timeout/fail.
    await expect(page.getByRole('dialog')).toBeVisible()
    
    // It should eventually go to Review or Summary
    // Since these are random suppliers, they should trigger review
    await expect(page.getByText('Revisione fatture')).toBeVisible({ timeout: 15000 })
    
    // Check if we are in review mode
    await expect(page.getByText('Dati Anagrafici Fornitore')).toBeVisible()
    
    // Fill required supplier data for the first invoice
    await page.getByLabel('Indirizzo').fill('Via Nuova 10')
    await page.getByLabel('Città').fill('Milano')
    await page.getByLabel('Prov.').fill('MI')
    await page.getByLabel('CAP').fill('20100')
    
    // Import and Continue
    await page.getByRole('button', { name: 'Importa e Continua' }).click()
    
    // Since we have 2 new suppliers, we expect another review step or summary if handled differently
    // For this test, we assume the flow continues.
    // If there is another one, we might need to fill it too.
    // Let's see if we see "Importazione Completata" or another review.
    
    // If "Importazione Completata" is NOT visible, it means we have another review.
    // We can loop or check visibility.
    const isSummary = await page.getByText('Importazione Completata').isVisible().catch(() => false)
    
    if (!isSummary) {
       // Handle second review
       await page.getByLabel('Indirizzo').fill('Via Seconda 20')
       await page.getByLabel('Città').fill('Roma')
       await page.getByLabel('Prov.').fill('RM')
       await page.getByLabel('CAP').fill('00100')
       await page.getByRole('button', { name: 'Importa e Continua' }).click()
    }

    // Should now definitely be at Summary
    await expect(page.getByText('Importazione Completata')).toBeVisible()
    
    await page.getByRole('button', { name: 'Chiudi' }).click()
    await expect(page.getByRole('dialog')).toBeHidden()
  })
})
