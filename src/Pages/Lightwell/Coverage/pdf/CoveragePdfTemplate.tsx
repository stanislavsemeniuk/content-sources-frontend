import { Content, Title } from '@patternfly/react-core';
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table';
import type { AsyncState } from '@redhat-cloud-services/types';

import type { CoverageReportPackage } from 'services/Lightwell/CoverageReportsApi';
import {
  COVERAGE_PDF_COLUMNS,
  type CoveragePdfAdditionalData,
  type CoveragePdfData,
} from '../utils/coveragePdf';

type CoveragePdfTemplateProps = {
  asyncData: AsyncState<CoveragePdfData>;
  additionalData?: Partial<CoveragePdfAdditionalData>;
};

/** Match-status pill colors, mirroring the green/orange/grey Labels in PackageCoverageTable. */
const MATCH_STATUS_PDF_LABEL: Record<
  CoverageReportPackage['match_status'],
  { text: string; background: string; color: string }
> = {
  exact: { text: 'Exact', background: '#e5f2e0', color: '#3d7317' },
  partial: { text: 'Partial', background: '#faeae1', color: '#c46100' },
  none: { text: 'None', background: '#f0f0f0', color: '#4d5258' },
};

const CoveragePdfTemplate = ({ asyncData, additionalData }: CoveragePdfTemplateProps) => {
  const { data } = asyncData;
  const packages = data?.packages ?? [];
  const includeSummary = additionalData?.includeSummary !== false;
  const filename = additionalData?.filename;
  const generatedAt = additionalData?.generatedAt;
  const summary = additionalData?.summary;

  return (
    <div className='coverage-pdf'>
      <style
        dangerouslySetInnerHTML={{
          __html: `
        .coverage-pdf {
          color: #151515;
          font-family: 'Red Hat Text', Helvetica, Arial, sans-serif;
          padding: 8px 0 16px;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .coverage-pdf h1 { color: #c9190b; margin: 0 0 8px; }
        .coverage-pdf h2 { margin: 28px 0 12px; page-break-after: avoid; }
        .coverage-pdf .coverage-pdf-meta { color: #6a6e73; margin-bottom: 16px; }
        .coverage-pdf .coverage-pdf-stats {
          display: flex;
          justify-content: center;
          gap: 32px;
          margin: 16px 0 28px;
        }
        .coverage-pdf .coverage-pdf-stat { text-align: center; }
        .coverage-pdf .coverage-pdf-stat-value { font-size: 24px; font-weight: 700; }
        .coverage-pdf .coverage-pdf-stat-value--exact { color: #3d7317; }
        .coverage-pdf .coverage-pdf-stat-value--partial { color: #c46100; }
        .coverage-pdf .coverage-pdf-stat-value--unmatched { color: #6a6e73; }
        .coverage-pdf .coverage-pdf-stat-label { font-size: 11px; color: #6a6e73; }
        .coverage-pdf table,
        .coverage-pdf .pf-v6-c-table,
        .coverage-pdf .pf-v5-c-table {
          display: table;
          width: 100%;
          border-collapse: collapse;
          table-layout: auto;
        }
        .coverage-pdf thead { display: table-header-group; }
        .coverage-pdf tbody { display: table-row-group; }
        .coverage-pdf tr { display: table-row; page-break-inside: avoid; }
        .coverage-pdf th, .coverage-pdf td {
          display: table-cell;
          font-size: 10px;
          vertical-align: top;
        }
        .coverage-pdf th {
          background-color: #f0f0f0;
          font-weight: 700;
          padding: 8px 8px 6px;
          text-align: left;
        }
        .coverage-pdf td { padding: 6px 8px; white-space: nowrap; }
        .coverage-pdf .coverage-pdf-pkg-table { width: 100%; }
        .coverage-pdf .coverage-pdf-pkg-table tbody tr:nth-child(even) td {
          background-color: #fafafa;
        }
        .coverage-pdf .coverage-pdf-col-name {
          white-space: normal;
          overflow-wrap: anywhere;
        }
        .coverage-pdf .coverage-pdf-col-version,
        .coverage-pdf .coverage-pdf-col-ecosystem,
        .coverage-pdf .coverage-pdf-col-match {
          width: 1%;
          white-space: nowrap;
        }
        .coverage-pdf .coverage-pdf-match {
          display: inline-block;
          border-radius: 20px;
          padding: 1px 8px;
          font-size: 9px;
          font-weight: 600;
        }
      `,
        }}
      />
      {includeSummary ? (
        <>
          <Title headingLevel='h1' size='xl'>
            Lightwell Coverage Report
          </Title>
          <Content className='coverage-pdf-meta'>
            {filename ? `Manifest: ${filename}` : null}
            {filename && generatedAt ? ' · ' : null}
            {generatedAt ? `Generated: ${generatedAt}` : null}
          </Content>
          {summary ? (
            <div className='coverage-pdf-stats' role='list' aria-label='Coverage summary'>
              <div className='coverage-pdf-stat' role='listitem'>
                <div className='coverage-pdf-stat-value'>{summary.total}</div>
                <div className='coverage-pdf-stat-label'>Total</div>
              </div>
              <div className='coverage-pdf-stat' role='listitem'>
                <div className='coverage-pdf-stat-value coverage-pdf-stat-value--exact'>
                  {summary.exact_matches}
                </div>
                <div className='coverage-pdf-stat-label'>Exact</div>
              </div>
              <div className='coverage-pdf-stat' role='listitem'>
                <div className='coverage-pdf-stat-value coverage-pdf-stat-value--partial'>
                  {summary.partial_matches}
                </div>
                <div className='coverage-pdf-stat-label'>Partial</div>
              </div>
              <div className='coverage-pdf-stat' role='listitem'>
                <div className='coverage-pdf-stat-value coverage-pdf-stat-value--unmatched'>
                  {summary.unmatched}
                </div>
                <div className='coverage-pdf-stat-label'>Unmatched</div>
              </div>
            </div>
          ) : null}
          <Title headingLevel='h2' size='md'>
            Packages
          </Title>
        </>
      ) : (
        <Title headingLevel='h2' size='md'>
          Packages (continued)
        </Title>
      )}
      <Table
        variant='compact'
        className='coverage-pdf-pkg-table'
        aria-label='Coverage packages'
        gridBreakPoint=''
      >
        <Thead>
          <Tr>
            {COVERAGE_PDF_COLUMNS.map((column) => (
              <Th key={column.key} className={`coverage-pdf-col-${column.key}`}>
                {column.title}
              </Th>
            ))}
          </Tr>
        </Thead>
        <Tbody>
          {packages.map((pkg) => {
            const match = MATCH_STATUS_PDF_LABEL[pkg.match_status];
            return (
              <Tr key={`${pkg.ecosystem}-${pkg.name}-${pkg.version}`}>
                <Td dataLabel='Package' className='coverage-pdf-col-name'>
                  {pkg.name}
                </Td>
                <Td dataLabel='Version' className='coverage-pdf-col-version'>
                  {pkg.version || '—'}
                </Td>
                <Td dataLabel='Ecosystem' className='coverage-pdf-col-ecosystem'>
                  {pkg.ecosystem}
                </Td>
                <Td dataLabel='Match' className='coverage-pdf-col-match'>
                  <span
                    className='coverage-pdf-match'
                    style={{ backgroundColor: match.background, color: match.color }}
                  >
                    {match.text}
                  </span>
                </Td>
              </Tr>
            );
          })}
        </Tbody>
      </Table>
    </div>
  );
};

export default CoveragePdfTemplate;
