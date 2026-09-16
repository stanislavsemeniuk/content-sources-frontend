/** Shared configuration for the PDF server and renderer. */
export const PDF_SERVER_PORT = parseInt(process.env.PDF_SERVER_PORT || '3001', 10);

/**
 * Max simultaneous Puppeteer render processes (not PDF pages -- each render
 * produces one complete multi-page PDF in a single Chromium tab).
 */
export const MAX_CONCURRENT_RENDERS = parseInt(process.env.PDF_MAX_CONCURRENT || '3', 10);

/** Maximum number of vulnerabilities allowed in a single PDF export. */
export const MAX_VULNERABILITIES = 5000;

/** Maximum number of coverage packages allowed in a single PDF export. */
export const MAX_COVERAGE_PACKAGES = 10_000;

/** Timeout for individual Puppeteer operations (page.goto, page.pdf) in ms. */
export const RENDER_TIMEOUT_MS = 30_000;

/** Overall timeout for the PDF handler (belt-and-suspenders above RENDER_TIMEOUT_MS) in ms. */
export const HANDLER_TIMEOUT_MS = 60_000;

export const PDF_SERVER_ORIGIN = `http://127.0.0.1:${PDF_SERVER_PORT}`;

/** Base URL where the PDF server serves PatternFly styles (fonts + CSS). */
export const PDF_STYLES_BASE_URL = `${PDF_SERVER_ORIGIN}/pdf/styles`;

/**
 * Temporary store for rendered HTML pages. The PDF renderer stores HTML here
 * so Puppeteer can fetch it via page.goto() (same-origin with fonts).
 */
export const pendingRenders = new Map<string, string>();
