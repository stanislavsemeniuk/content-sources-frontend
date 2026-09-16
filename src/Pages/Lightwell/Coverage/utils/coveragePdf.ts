import type { CoverageReportPackage } from 'services/Lightwell/CoverageReportsApi';

export function formatCoveragePdfGeneratedAt(date: Date = new Date()): string {
  const day = date.getUTCDate();
  const month = date.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
  const year = date.getUTCFullYear();
  return `${day} ${month} ${year}`;
}

/** Columns rendered in the coverage PDF, mirroring PackageCoverageTable's web view. */
export type CoveragePdfColumn = { key: string; title: string };

export const COVERAGE_PDF_COLUMNS: CoveragePdfColumn[] = [
  { key: 'name', title: 'Package' },
  { key: 'version', title: 'Version' },
  { key: 'ecosystem', title: 'Ecosystem' },
  { key: 'match', title: 'Match' },
];

/** Match-coverage totals shown in the summary header. */
export type CoveragePdfSummary = {
  total: number;
  exact_matches: number;
  partial_matches: number;
  unmatched: number;
};

export type CoveragePdfData = {
  packages: CoverageReportPackage[];
};

export type CoveragePdfAdditionalData = {
  filename?: string;
  summary?: CoveragePdfSummary;
  includeSummary: boolean;
  generatedAt: string;
  headerBrand: 'lightwell';
};
