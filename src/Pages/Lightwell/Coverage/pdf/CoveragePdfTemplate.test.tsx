import { render, screen } from '@testing-library/react';

import CoveragePdfTemplate from './CoveragePdfTemplate';
import { defaultCoverageReportPackagesItem } from 'testingHelpers';

const summary = { total: 100, exact_matches: 60, partial_matches: 15, unmatched: 25 };

describe('CoveragePdfTemplate', () => {
  it('renders the summary header, meta, and package rows', () => {
    render(
      <CoveragePdfTemplate
        asyncData={{ data: { packages: defaultCoverageReportPackagesItem } }}
        additionalData={{
          filename: 'sbom.json',
          generatedAt: '25 Aug 2026',
          includeSummary: true,
          summary,
        }}
      />,
    );

    expect(screen.getByText('Lightwell Coverage Report')).toBeInTheDocument();
    expect(screen.getByText(/Manifest: sbom.json/)).toBeInTheDocument();
    expect(screen.getByText(/Generated: 25 Aug 2026/)).toBeInTheDocument();

    const stats = screen.getByLabelText('Coverage summary');
    expect(stats).toHaveTextContent('Total');
    expect(stats).toHaveTextContent('Exact');
    expect(stats).toHaveTextContent('Partial');
    expect(stats).toHaveTextContent('Unmatched');

    const headers = screen.getAllByRole('columnheader');
    expect(headers.map((h) => h.textContent)).toEqual(['Package', 'Version', 'Ecosystem', 'Match']);

    const row = screen.getByText('spring-web').closest('tr');
    expect(row).toHaveTextContent('6.1.5');
    expect(row).toHaveTextContent('Java');
    expect(row).toHaveTextContent('Exact');
  });

  it('omits the summary header on continuation pages', () => {
    render(
      <CoveragePdfTemplate
        asyncData={{ data: { packages: defaultCoverageReportPackagesItem.slice(0, 1) } }}
        additionalData={{ includeSummary: false }}
      />,
    );

    expect(screen.queryByText('Lightwell Coverage Report')).not.toBeInTheDocument();
    expect(screen.getByText('Packages (continued)')).toBeInTheDocument();
    expect(screen.getByText('spring-web')).toBeInTheDocument();
  });
});
