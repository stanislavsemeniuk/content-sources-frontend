import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import PackageCoverageTable from './PackageCoverageTable';
import { usePackageCoverageTable } from '../hooks/usePackageCoverageTable';
import { useCoverageReportPackagesQuery } from 'services/Lightwell/CoverageReportsQueries';
import { defaultCoverageReportPackagesItem, ReactQueryTestWrapper } from 'testingHelpers';

jest.mock('services/Lightwell/CoverageReportsQueries', () => ({
  ...jest.requireActual('services/Lightwell/CoverageReportsQueries'),
  useCoverageReportPackagesQuery: jest.fn(),
}));

// Wraps the table with the lifted filter/pagination state it now receives as a prop.
const TableHarness = ({ ecosystems }: { ecosystems: string[] }) => {
  const tableState = usePackageCoverageTable(ecosystems);
  return <PackageCoverageTable uuid='test-uuid' ecosystems={ecosystems} tableState={tableState} />;
};

const renderTable = (ecosystems = ['Java', 'Python', 'npm']) =>
  render(
    <ReactQueryTestWrapper>
      <TableHarness ecosystems={ecosystems} />
    </ReactQueryTestWrapper>,
  );

describe('PackageCoverageTable', () => {
  beforeEach(() => {
    (useCoverageReportPackagesQuery as jest.Mock).mockImplementation(() => ({
      isLoading: false,
      isFetching: false,
      isError: false,
      data: {
        data: defaultCoverageReportPackagesItem,
        meta: { count: 3, limit: 20, offset: 0 },
      },
    }));
  });

  it('renders package rows with name, version, ecosystem, and match status labels', () => {
    renderTable();

    expect(screen.getByText('spring-web')).toBeInTheDocument();
    expect(screen.getByText('flask')).toBeInTheDocument();
    expect(screen.getByText('lodash')).toBeInTheDocument();

    expect(screen.getByText('6.1.5')).toBeInTheDocument();
    expect(screen.getByText('3.0.3')).toBeInTheDocument();
    expect(screen.getByText('4.17.21')).toBeInTheDocument();

    expect(screen.getByText('Java')).toBeInTheDocument();
    expect(screen.getByText('Python')).toBeInTheDocument();
    expect(screen.getByText('npm')).toBeInTheDocument();

    expect(screen.getByText('Exact')).toBeInTheDocument();
    expect(screen.getByText('Partial')).toBeInTheDocument();
    expect(screen.getByText('None')).toBeInTheDocument();
  });

  it('renders column headers', () => {
    renderTable();

    const headers = screen.getAllByRole('columnheader');
    expect(headers).toHaveLength(4);
    expect(headers[0]).toHaveTextContent('Package');
    expect(headers[1]).toHaveTextContent('Version');
    expect(headers[2]).toHaveTextContent('Ecosystem');
    expect(headers[3]).toHaveTextContent('Match');
  });

  it('shows empty state when no packages are returned', () => {
    (useCoverageReportPackagesQuery as jest.Mock).mockImplementation(() => ({
      isLoading: false,
      isFetching: false,
      isError: false,
      data: {
        data: [],
        meta: { count: 0, limit: 20, offset: 0 },
      },
    }));

    renderTable();
    expect(screen.getByText('No packages were found in this manifest.')).toBeInTheDocument();
  });

  it('shows error state on query error', () => {
    (useCoverageReportPackagesQuery as jest.Mock).mockImplementation(() => ({
      isLoading: false,
      isFetching: false,
      isError: true,
    }));

    renderTable();
    expect(screen.getByText('Unable to load packages')).toBeInTheDocument();
  });

  it('renders filter controls for search, match, and ecosystem', async () => {
    const user = userEvent.setup();
    renderTable();

    expect(screen.getByPlaceholderText('Search packages...')).toBeInTheDocument();

    const filterCategoryToggle = screen.getByRole('button', { name: 'Package' });
    await user.click(filterCategoryToggle);

    const menu = screen.getByRole('menu');
    expect(within(menu).getByRole('menuitem', { name: 'Package' })).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: 'Match' })).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: 'Ecosystem' })).toBeInTheDocument();
  });
});
