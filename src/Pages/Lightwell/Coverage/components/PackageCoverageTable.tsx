import { Label, Pagination, ToolbarItem, ToolbarItemVariant } from '@patternfly/react-core';
import { SkeletonTableBody, ErrorState } from '@patternfly/react-component-groups';
import { DataView } from '@patternfly/react-data-view/dist/dynamic/DataView';
import {
  DataViewTable,
  DataViewTh,
  DataViewTrObject,
} from '@patternfly/react-data-view/dist/dynamic/DataViewTable';
import { DataViewToolbar } from '@patternfly/react-data-view/dist/dynamic/DataViewToolbar';
import { DataViewFilters } from '@patternfly/react-data-view/dist/dynamic/DataViewFilters';
import { DataViewTextFilter } from '@patternfly/react-data-view/dist/dynamic/DataViewTextFilter';
import { DataViewCheckboxFilter } from '@patternfly/react-data-view/dist/dynamic/DataViewCheckboxFilter';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import EmptyTableDataView from 'components/EmptyTableDataView/EmptyTableDataView';
import useTableActiveState from 'Hooks/tables/useTableActiveState';
import { LIGHTWELL_LENS_USE_MOCK } from 'Pages/Lightwell/constants';
import {
  getMockCoveragePackagesList,
  MOCK_COVERAGE_PACKAGES_QUERY_KEY,
} from 'Pages/Lightwell/mockCoveragePackages';
import { useCoverageReportPackagesQuery } from 'services/Lightwell/CoverageReportsQueries';
import {
  matchFilterOptions,
  type PackageCoverageTableState,
} from '../hooks/usePackageCoverageTable';
import type { CoverageReportPackage } from 'services/Lightwell/CoverageReportsApi';

const COLUMNS = ['Package', 'Version', 'Ecosystem', 'Match'];

const MATCH_STATUS_LABEL: Record<
  CoverageReportPackage['match_status'],
  { text: string; color: 'green' | 'orange' | 'grey' }
> = {
  exact: { text: 'Exact', color: 'green' },
  partial: { text: 'Partial', color: 'orange' },
  none: { text: 'None', color: 'grey' },
};

type PackageCoverageTableProps = {
  uuid: string;
  ecosystems: string[];
  tableState: PackageCoverageTableState;
};

const PackageCoverageTable = ({ uuid, ecosystems, tableState }: PackageCoverageTableProps) => {
  const useMock = LIGHTWELL_LENS_USE_MOCK;

  const {
    filters,
    debouncedFilters,
    isFiltered,
    clearAllFiltersAndResetPage,
    filtersActiveAttributeResetKey,
    handleFilterChange,
    paginationProps,
    ecosystemFilterOptions,
  } = tableState;

  const { page, perPage } = paginationProps;

  const mockPackagesQuery = useQuery({
    queryKey: [MOCK_COVERAGE_PACKAGES_QUERY_KEY, page, perPage, debouncedFilters, ecosystems],
    queryFn: () => getMockCoveragePackagesList(page, perPage, debouncedFilters, ecosystems),
    placeholderData: keepPreviousData,
    staleTime: 60000,
    enabled: useMock,
  });

  const apiPackagesQuery = useCoverageReportPackagesQuery(
    uuid,
    page,
    perPage,
    debouncedFilters,
    !useMock,
  );

  const {
    isLoading,
    isFetching,
    isError,
    data = { data: [], meta: { count: 0, limit: 20, offset: 0 } },
  } = useMock ? mockPackagesQuery : apiPackagesQuery;

  const {
    data: packages = [],
    meta: { count = 0 },
  } = data;

  const pagination = { ...paginationProps, itemCount: count };
  const activeState = useTableActiveState({
    isLoading,
    count,
    isFetching,
    isError,
  });

  const dataViewColumns: DataViewTh[] = COLUMNS.map((name) => ({ cell: name }));
  const dataViewRows: DataViewTrObject[] = packages.map((pkg: CoverageReportPackage) => {
    const { text, color } = MATCH_STATUS_LABEL[pkg.match_status];
    return {
      id: `${pkg.ecosystem}-${pkg.name}-${pkg.version}`,
      row: [
        { cell: pkg.name },
        { cell: pkg.version || '—' },
        { cell: pkg.ecosystem },
        {
          cell: (
            <Label isCompact color={color}>
              {text}
            </Label>
          ),
        },
      ],
    };
  });

  const ouiaId = 'lightwell-package-coverage-table';

  const topPagination = (
    <Pagination
      id='lightwell-package-coverage-top-pagination'
      widgetId='lightwellPackageCoverageTopPaginationWidgetId'
      {...pagination}
      isCompact
    />
  );

  const bottomPagination = (
    <Pagination
      id='lightwell-package-coverage-bottom-pagination'
      widgetId='lightwellPackageCoverageBottomPaginationWidgetId'
      {...pagination}
      variant='bottom'
    />
  );

  return (
    <DataView data-ouia-component-id={ouiaId} activeState={activeState}>
      <DataViewToolbar
        ouiaId='lightwell-package-coverage-toolbar'
        clearAllFilters={clearAllFiltersAndResetPage}
        filters={
          <DataViewFilters onChange={handleFilterChange} values={filters}>
            <DataViewTextFilter
              key={`search-${filtersActiveAttributeResetKey}`}
              filterId='search'
              ouiaId='lightwell-package-coverage-filter-search'
              title='Package'
              placeholder='Search packages...'
            />
            <DataViewCheckboxFilter
              filterId='match_status'
              ouiaId='lightwell-package-coverage-filter-match'
              title='Match'
              placeholder='Filter by match'
              options={matchFilterOptions}
            />
            <DataViewCheckboxFilter
              filterId='ecosystem'
              ouiaId='lightwell-package-coverage-filter-ecosystem'
              title='Ecosystem'
              placeholder='Filter by ecosystem'
              options={ecosystemFilterOptions}
            />
          </DataViewFilters>
        }
      >
        <ToolbarItem variant={ToolbarItemVariant.pagination} align={{ default: 'alignEnd' }}>
          {topPagination}
        </ToolbarItem>
      </DataViewToolbar>
      <DataViewTable
        aria-label='Package coverage table'
        ouiaId={ouiaId}
        variant='compact'
        columns={dataViewColumns}
        rows={dataViewRows}
        bodyStates={{
          empty: (
            <EmptyTableDataView
              ouiaId={ouiaId}
              variant={isFiltered ? 'filtered' : 'zero'}
              itemName='packages'
              zeroBody='No packages were found in this manifest.'
              colSpan={COLUMNS.length}
              onClearFilters={clearAllFiltersAndResetPage}
            />
          ),
          loading: <SkeletonTableBody rowsCount={perPage} columnsCount={COLUMNS.length} />,
          error: (
            <ErrorState
              titleText='Unable to load packages'
              bodyText='There was an error retrieving data. Check your connection and reload the page.'
              // Pass fragment to avoid rendering the default footer with a CTA button
              customFooter={<></>}
            />
          ),
        }}
      />
      <DataViewToolbar pagination={bottomPagination} />
    </DataView>
  );
};

export default PackageCoverageTable;
