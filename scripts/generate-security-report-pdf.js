const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const { marked } = require('marked');

async function generatePDF() {
  const markdownPath = path.join(__dirname, '../docs/Security_Audit_Report_2026-01-11.md');
  const outputPath = path.join(__dirname, '../docs/Security_Audit_Report_2026-01-11.pdf');

  // Leggi il file markdown
  const markdown = fs.readFileSync(markdownPath, 'utf-8');

  // Converti in HTML
  const htmlContent = marked.parse(markdown);

  // HTML completo con stili
  const fullHtml = `
<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8">
  <title>Security Audit Report - Weiss Cafè</title>
  <style>
    @page {
      margin: 2cm;
      @bottom-center {
        content: "Pagina " counter(page) " di " counter(pages);
        font-size: 10px;
        color: #666;
      }
    }

    * {
      box-sizing: border-box;
    }

    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      font-size: 11pt;
      line-height: 1.6;
      color: #333;
      max-width: 100%;
      margin: 0;
      padding: 0;
    }

    h1 {
      color: #1a365d;
      border-bottom: 3px solid #2b6cb0;
      padding-bottom: 10px;
      font-size: 24pt;
      page-break-after: avoid;
    }

    h2 {
      color: #2c5282;
      border-bottom: 2px solid #4299e1;
      padding-bottom: 8px;
      margin-top: 30px;
      font-size: 18pt;
      page-break-after: avoid;
    }

    h3 {
      color: #2d3748;
      font-size: 14pt;
      margin-top: 20px;
      page-break-after: avoid;
    }

    h4 {
      color: #4a5568;
      font-size: 12pt;
      page-break-after: avoid;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      margin: 15px 0;
      font-size: 10pt;
      page-break-inside: avoid;
    }

    th {
      background-color: #2b6cb0;
      color: white;
      padding: 10px 8px;
      text-align: left;
      font-weight: 600;
    }

    td {
      padding: 8px;
      border-bottom: 1px solid #e2e8f0;
    }

    tr:nth-child(even) {
      background-color: #f7fafc;
    }

    tr:hover {
      background-color: #edf2f7;
    }

    code {
      background-color: #edf2f7;
      padding: 2px 6px;
      border-radius: 4px;
      font-family: 'Consolas', 'Monaco', monospace;
      font-size: 9pt;
    }

    pre {
      background-color: #1a202c;
      color: #e2e8f0;
      padding: 15px;
      border-radius: 8px;
      overflow-x: auto;
      font-size: 9pt;
      line-height: 1.4;
      page-break-inside: avoid;
    }

    pre code {
      background-color: transparent;
      padding: 0;
      color: inherit;
    }

    blockquote {
      border-left: 4px solid #4299e1;
      margin: 15px 0;
      padding: 10px 20px;
      background-color: #ebf8ff;
      font-style: italic;
    }

    hr {
      border: none;
      border-top: 2px solid #e2e8f0;
      margin: 30px 0;
    }

    ul, ol {
      margin: 10px 0;
      padding-left: 25px;
    }

    li {
      margin: 5px 0;
    }

    /* Colori per stato */
    .critico { color: #c53030; font-weight: bold; }
    .alto { color: #dd6b20; font-weight: bold; }
    .medio { color: #d69e2e; }
    .basso { color: #38a169; }

    /* Prima pagina */
    .cover-page {
      text-align: center;
      padding-top: 200px;
    }

    /* Intestazione sezioni */
    .section-header {
      background: linear-gradient(135deg, #2b6cb0, #4299e1);
      color: white;
      padding: 15px 20px;
      margin: 30px -20px 20px -20px;
      border-radius: 0;
    }

    /* Box evidenza */
    .highlight-box {
      background-color: #fff5f5;
      border: 1px solid #fc8181;
      border-left: 4px solid #c53030;
      padding: 15px;
      margin: 15px 0;
      border-radius: 4px;
    }

    .info-box {
      background-color: #ebf8ff;
      border: 1px solid #90cdf4;
      border-left: 4px solid #3182ce;
      padding: 15px;
      margin: 15px 0;
      border-radius: 4px;
    }

    /* Footer */
    .footer {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      text-align: center;
      font-size: 9pt;
      color: #718096;
      padding: 10px;
      border-top: 1px solid #e2e8f0;
    }

    /* Page breaks */
    .page-break {
      page-break-before: always;
    }

    /* Nascondere link href */
    a {
      color: #2b6cb0;
      text-decoration: none;
    }

    a:hover {
      text-decoration: underline;
    }

    /* Stampa ottimizzata */
    @media print {
      body {
        font-size: 10pt;
      }

      h1 { font-size: 20pt; }
      h2 { font-size: 16pt; }
      h3 { font-size: 13pt; }

      pre {
        white-space: pre-wrap;
        word-wrap: break-word;
      }
    }
  </style>
</head>
<body>
  ${htmlContent}

  <div class="footer">
    CONFIDENZIALE - Weiss Cafè Security Audit Report - 11 Gennaio 2026
  </div>
</body>
</html>
`;

  // Lancia Puppeteer
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();

  // Imposta il contenuto HTML
  await page.setContent(fullHtml, {
    waitUntil: 'networkidle0'
  });

  // Genera il PDF
  await page.pdf({
    path: outputPath,
    format: 'A4',
    printBackground: true,
    margin: {
      top: '2cm',
      bottom: '2.5cm',
      left: '2cm',
      right: '2cm'
    },
    displayHeaderFooter: true,
    headerTemplate: `
      <div style="width: 100%; font-size: 9px; padding: 5px 20px; color: #666; border-bottom: 1px solid #ddd;">
        <span style="float: left;">Security Audit Report - Weiss Cafè</span>
        <span style="float: right;">CONFIDENZIALE</span>
      </div>
    `,
    footerTemplate: `
      <div style="width: 100%; font-size: 9px; padding: 5px 20px; color: #666; text-align: center;">
        Pagina <span class="pageNumber"></span> di <span class="totalPages"></span>
      </div>
    `
  });

  await browser.close();

  console.log(`PDF generato con successo: ${outputPath}`);
}

generatePDF().catch(console.error);
