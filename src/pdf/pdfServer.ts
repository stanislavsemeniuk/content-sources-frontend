/**
 * Lightweight Express server for in-app PDF generation.
 * Replaces the crc-pdf-generator microservice for Beacon PDF exports.
 *
 * This is a pure rendering server: the frontend fetches data (respecting its
 * own mock flags) and sends it in the POST body. The server only converts
 * the data into a PDF via Puppeteer.
 *
 * Font files are served at /pdf/styles/ from PatternFly's dist/styles/ directory.
 * Puppeteer navigates to /pdf/render/:id (same-origin) so fonts load reliably.
 *
 * Usage: yarn start:pdf
 */
import { resolve } from 'path';
import express from 'express';
import rateLimit from 'express-rate-limit';

import {
  formatBeaconPdfGeneratedAt,
  type BeaconPdfColumn,
  type BeaconPdfData,
} from 'Pages/Lightwell/Beacon/pdf/beaconPdf';
import {
  formatCoveragePdfGeneratedAt,
  type CoveragePdfData,
  type CoveragePdfSummary,
} from 'Pages/Lightwell/Coverage/utils/coveragePdf';

import { generateBeaconPdf, generateCoveragePdf, closeBrowser, getBrowser } from './pdfRenderer';
import { PF_STYLES_DIR } from './pdfFonts';
import {
  PDF_SERVER_PORT,
  HANDLER_TIMEOUT_MS,
  MAX_VULNERABILITIES,
  MAX_COVERAGE_PACKAGES,
  pendingRenders,
} from './pdfConfig';
import { registry, pdfDuration, pdfErrors } from './pdfMetrics';

type PdfRequestBody = {
  customerId: string;
  visibleColumns: BeaconPdfColumn[];
  data: BeaconPdfData;
};

export async function handleBeaconPdf(req: express.Request, res: express.Response): Promise<void> {
  const { customerId, visibleColumns, data } = req.body as PdfRequestBody;

  if (!customerId) {
    res.status(400).json({ error: 'customerId is required' });
    return;
  }

  if (!/^[\w-]+$/.test(customerId)) {
    res.status(400).json({ error: 'customerId contains invalid characters' });
    return;
  }

  if (!Array.isArray(visibleColumns) || visibleColumns.length === 0) {
    res.status(400).json({ error: 'visibleColumns is required' });
    return;
  }

  if (!data?.vulnerabilities) {
    res.status(400).json({ error: 'data with vulnerabilities is required' });
    return;
  }

  if (data.vulnerabilities.length > MAX_VULNERABILITIES) {
    res.status(400).json({
      error: `Too many vulnerabilities (${data.vulnerabilities.length}). Maximum is ${MAX_VULNERABILITIES}.`,
    });
    return;
  }

  try {
    const end = pdfDuration.startTimer();
    const generatedAt = formatBeaconPdfGeneratedAt();
    const pdfBuffer = await generateBeaconPdf(data, visibleColumns, customerId, generatedAt);
    end();

    const filename = `lightwell-beacon-${customerId}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(Buffer.from(pdfBuffer));
  } catch (err) {
    pdfErrors.inc({ reason: err instanceof Error ? err.constructor.name : 'unknown' });
    console.error('PDF generation failed:', err);
    res.status(500).json({
      error: 'PDF generation failed',
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

type CoveragePdfRequestBody = {
  filename?: string;
  summary?: CoveragePdfSummary;
  data: CoveragePdfData;
};

export async function handleCoveragePdf(
  req: express.Request,
  res: express.Response,
): Promise<void> {
  const { filename, summary, data } = req.body as CoveragePdfRequestBody;

  if (!Array.isArray(data?.packages)) {
    res.status(400).json({ error: 'data with packages is required' });
    return;
  }

  if (data.packages.length > MAX_COVERAGE_PACKAGES) {
    res.status(400).json({
      error: `Too many packages (${data.packages.length}). Maximum is ${MAX_COVERAGE_PACKAGES}.`,
    });
    return;
  }

  try {
    const end = pdfDuration.startTimer();
    const generatedAt = formatCoveragePdfGeneratedAt();
    const pdfBuffer = await generateCoveragePdf(data, {
      filename,
      summary,
      includeSummary: true,
      generatedAt,
    });
    end();

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="lightwell-coverage-report.pdf"');
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(Buffer.from(pdfBuffer));
  } catch (err) {
    pdfErrors.inc({ reason: err instanceof Error ? err.constructor.name : 'unknown' });
    console.error('PDF generation failed:', err);
    res.status(500).json({
      error: 'PDF generation failed',
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function handleHealthz(_req: express.Request, res: express.Response): Promise<void> {
  try {
    const browser = await getBrowser();
    const page = await browser.newPage();
    await page.close();
    res.json({ status: 'ok' });
  } catch (err) {
    res.status(503).json({
      status: 'unhealthy',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '10mb' }));

app.get('/pdf/styles/pdf-fonts.css', (_req, res) => {
  res.sendFile(resolve(__dirname, 'pdf-fonts.css'));
});

app.use(
  '/pdf/styles',
  express.static(PF_STYLES_DIR, {
    maxAge: '1d',
    immutable: true,
  }),
);

app.get('/pdf/healthz', handleHealthz);

app.get('/metrics', async (_req, res) => {
  res.set('Content-Type', registry.contentType);
  res.send(await registry.metrics());
});

app.get('/pdf/render/:id', (req, res) => {
  const { id } = req.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) {
    res.status(400).send('Invalid render ID');
    return;
  }
  const html = pendingRenders.get(id);
  if (!html) {
    res.status(404).send('Not found');
    return;
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

const pdfRateLimiter = rateLimit({
  windowMs: 60_000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many PDF requests. Please wait a minute before trying again.' },
});

app.post('/pdf/beacon', pdfRateLimiter, (req, res) => {
  const timer = setTimeout(() => {
    if (!res.headersSent) {
      res.status(504).json({ error: 'PDF generation timed out' });
    }
  }, HANDLER_TIMEOUT_MS);

  handleBeaconPdf(req, res).finally(() => clearTimeout(timer));
});

app.post('/pdf/coverage', pdfRateLimiter, (req, res) => {
  const timer = setTimeout(() => {
    if (!res.headersSent) {
      res.status(504).json({ error: 'PDF generation timed out' });
    }
  }, HANDLER_TIMEOUT_MS);

  handleCoveragePdf(req, res).finally(() => clearTimeout(timer));
});

export default app;

if (require.main === module) {
  const server = app.listen(PDF_SERVER_PORT, () => {
    console.log(`PDF server listening on port ${PDF_SERVER_PORT}`);
  });

  process.on('SIGTERM', async () => {
    await closeBrowser();
    server.close();
  });

  process.on('SIGINT', async () => {
    await closeBrowser();
    server.close();
  });
}
