/**
 * Core PDF rendering pipeline: React SSR -> Puppeteer print.
 * Ported from crc-pdf-generator's clusterTask.ts and pdfCache.ts.
 *
 * Key design decisions:
 * - Uses page.goto() instead of page.setContent() so that fonts served by
 *   the Express server are same-origin and load reliably.
 * - Explicitly calls document.fonts.load() because Chrome's lazy font loading
 *   may not trigger downloads before networkidle0 fires.
 * - The rendered HTML is stored temporarily in pendingRenders and served at
 *   /pdf/render/:id by the Express server.
 */
import { randomUUID } from 'crypto';
import { renderToStaticMarkup } from 'react-dom/server';
import puppeteer, { type Browser } from 'puppeteer';

import BeaconPdfTemplate from 'Pages/Lightwell/Beacon/pdf/BeaconPdfTemplate';
import {
  shouldUseLandscapePdf,
  type BeaconPdfAdditionalData,
  type BeaconPdfColumn,
  type BeaconPdfData,
} from 'Pages/Lightwell/Beacon/pdf/beaconPdf';
import CoveragePdfTemplate from 'Pages/Lightwell/Coverage/pdf/CoveragePdfTemplate';
import type {
  CoveragePdfAdditionalData,
  CoveragePdfData,
} from 'Pages/Lightwell/Coverage/utils/coveragePdf';
import { getHeaderAndFooterTemplates } from './pdfHeader';
import { getFontLinkTag } from './pdfFonts';
import { LIGHTWELL_LOGOMARK_SVG } from './lightwellLogomark';
import {
  PDF_STYLES_BASE_URL,
  PDF_SERVER_ORIGIN,
  MAX_CONCURRENT_RENDERS,
  RENDER_TIMEOUT_MS,
  pendingRenders,
} from './pdfConfig';
import { activeRenders as activeRendersGauge } from './pdfMetrics';

const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;
const VIEWPORT_WIDTH = (A4_HEIGHT_MM - 20) * 4; // 1108
const VIEWPORT_HEIGHT = (A4_WIDTH_MM - 40) * 4; // 680

let browserInstance: Browser | null = null;
let launchPromise: Promise<Browser> | null = null;

export async function getBrowser(): Promise<Browser> {
  if (browserInstance?.connected) {
    return browserInstance;
  }
  if (!launchPromise) {
    launchPromise = (async () => {
      const executablePath = process.env.CHROME_PATH || undefined;
      const browser = await puppeteer.launch({
        headless: true,
        executablePath,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
      });
      browserInstance = browser;
      return browser;
    })().finally(() => {
      launchPromise = null;
    });
  }
  return launchPromise;
}

export async function closeBrowser(): Promise<void> {
  launchPromise = null;
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
  }
}

export function renderBeaconPdfHtml(
  data: BeaconPdfData,
  additionalData: Partial<BeaconPdfAdditionalData>,
): string {
  const templateHtml = renderToStaticMarkup(
    <BeaconPdfTemplate asyncData={{ data }} additionalData={additionalData} />,
  );

  const fontLink = getFontLinkTag(PDF_STYLES_BASE_URL);

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  ${fontLink}
  <style>body { margin: 0; padding: 0; }</style>
</head>
<body>${templateHtml}</body>
</html>`;
}

export function renderCoveragePdfHtml(
  data: CoveragePdfData,
  additionalData: Partial<CoveragePdfAdditionalData>,
): string {
  const templateHtml = renderToStaticMarkup(
    <CoveragePdfTemplate asyncData={{ data }} additionalData={additionalData} />,
  );

  const fontLink = getFontLinkTag(PDF_STYLES_BASE_URL);

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  ${fontLink}
  <style>body { margin: 0; padding: 0; }</style>
</head>
<body>${templateHtml}</body>
</html>`;
}

// Concurrency semaphore: limits simultaneous Puppeteer renders to avoid OOM.
let activeRenders = 0;
const waitQueue: Array<() => void> = [];

function acquireSlot(): Promise<void> {
  if (activeRenders < MAX_CONCURRENT_RENDERS) {
    activeRenders++;
    activeRendersGauge.inc();
    return Promise.resolve();
  }
  return new Promise((resolve) =>
    waitQueue.push(() => {
      activeRendersGauge.inc();
      resolve();
    }),
  );
}

function releaseSlot(): void {
  activeRendersGauge.dec();
  const next = waitQueue.shift();
  if (next) {
    next();
  } else {
    activeRenders--;
  }
}

export async function printPdf(
  html: string,
  options: { landscape?: boolean },
): Promise<Uint8Array> {
  await acquireSlot();
  try {
    return await printPdfInner(html, options);
  } finally {
    releaseSlot();
  }
}

async function printPdfInner(html: string, options: { landscape?: boolean }): Promise<Uint8Array> {
  const browser = await getBrowser();
  const page = await browser.newPage();

  const renderId = randomUUID();
  pendingRenders.set(renderId, html);

  try {
    await page.setViewport({
      width: VIEWPORT_WIDTH,
      height: VIEWPORT_HEIGHT,
    });

    await page.setCacheEnabled(false);

    await page.goto(`${PDF_SERVER_ORIGIN}/pdf/render/${renderId}`, {
      waitUntil: 'networkidle0',
      timeout: RENDER_TIMEOUT_MS,
    });

    await page.evaluate(async () => {
      await Promise.all([
        document.fonts.load('16px "Red Hat Text"'),
        document.fonts.load('bold 16px "Red Hat Text"'),
        document.fonts.load('italic 16px "Red Hat Text"'),
        document.fonts.load('16px "Red Hat Display"'),
        document.fonts.load('bold 16px "Red Hat Display"'),
      ]);
    });

    const { headerTemplate, footerTemplate } = getHeaderAndFooterTemplates(LIGHTWELL_LOGOMARK_SVG);

    const buffer = await page.pdf({
      format: 'a4',
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate,
      footerTemplate,
      landscape: options.landscape ?? false,
      margin: { top: '80px', bottom: '54px', left: '28px', right: '28px' },
      timeout: RENDER_TIMEOUT_MS,
    });

    return new Uint8Array(buffer);
  } finally {
    pendingRenders.delete(renderId);
    await page.close();
  }
}

export async function generateBeaconPdf(
  data: BeaconPdfData,
  columns: BeaconPdfColumn[],
  customerId: string,
  generatedAt: string,
): Promise<Uint8Array> {
  const landscape = shouldUseLandscapePdf(columns);
  const additionalData: Partial<BeaconPdfAdditionalData> = {
    visibleColumns: columns,
    includeSummary: true,
    generatedAt,
    customerId,
    headerBrand: 'lightwell',
    landscape,
  };

  const html = renderBeaconPdfHtml(data, additionalData);
  return printPdf(html, { landscape });
}

export async function generateCoveragePdf(
  data: CoveragePdfData,
  additionalData: Omit<CoveragePdfAdditionalData, 'headerBrand'>,
): Promise<Uint8Array> {
  const html = renderCoveragePdfHtml(data, {
    ...additionalData,
    headerBrand: 'lightwell',
  });
  // Coverage PDFs render four narrow columns and always fit A4 portrait.
  return printPdf(html, { landscape: false });
}
