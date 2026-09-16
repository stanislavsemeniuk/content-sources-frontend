import { useState } from 'react';
import {
  AlertVariant,
  Dropdown,
  DropdownItem,
  DropdownList,
  MenuToggle,
  Spinner,
  type MenuToggleElement,
} from '@patternfly/react-core';
import axios from 'axios';

import useErrorNotification from 'Hooks/useErrorNotification';
import useNotification from 'Hooks/useNotification';
import { LIGHTWELL_LENS_USE_MOCK } from 'Pages/Lightwell/constants';
import { getMockCoveragePackagesList } from 'Pages/Lightwell/mockCoveragePackages';
import {
  getCoverageReportPackages,
  type CoverageReportPackage,
  type CoverageReportPackageFilters,
} from 'services/Lightwell/CoverageReportsApi';
import type { CoveragePdfSummary } from '../utils/coveragePdf';

type ExportMenuProps = {
  uuid: string;
  ecosystems: string[];
  filters?: CoverageReportPackageFilters;
  filename?: string;
  summary: CoveragePdfSummary;
};

const EXPORT_PAGE_SIZE = 200;

export async function fetchAllFilteredCoveragePackages(
  uuid: string,
  ecosystems: string[],
  filters?: CoverageReportPackageFilters,
): Promise<CoverageReportPackage[]> {
  const packages: CoverageReportPackage[] = [];
  let page = 1;

  while (true) {
    const result = LIGHTWELL_LENS_USE_MOCK
      ? getMockCoveragePackagesList(page, EXPORT_PAGE_SIZE, filters ?? {}, ecosystems)
      : await getCoverageReportPackages(uuid, page, EXPORT_PAGE_SIZE, filters);

    packages.push(...result.data);

    if (result.data.length < EXPORT_PAGE_SIZE) {
      break;
    }

    page += 1;
  }

  return packages;
}

export function ExportMenu({ uuid, ecosystems, filters, filename, summary }: ExportMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const errorNotifier = useErrorNotification();
  const { notify } = useNotification();

  const handleExportPdf = async () => {
    if (!uuid || isExporting) {
      return;
    }

    setIsOpen(false);
    setIsExporting(true);
    try {
      notify({
        variant: AlertVariant.info,
        title: 'Generating PDF',
        description: 'Your PDF is being generated. The download will start when it is ready.',
      });

      const packages = await fetchAllFilteredCoveragePackages(uuid, ecosystems, filters);

      const response = await axios.post(
        '/pdf/coverage',
        { filename, summary, data: { packages } },
        { responseType: 'blob' },
      );

      const url = URL.createObjectURL(response.data as Blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'lightwell-coverage-report.pdf';
      link.click();
      URL.revokeObjectURL(url);

      notify({
        variant: AlertVariant.success,
        title: 'PDF ready',
        description: 'Your download should start shortly.',
      });
    } catch (err) {
      errorNotifier(
        'Error exporting coverage report',
        'Unable to export coverage report',
        err,
        'coverage-export-error',
      );
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Dropdown
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!isExporting) {
          setIsOpen(open);
        }
      }}
      popperProps={{ position: 'right' }}
      toggle={(toggleRef: React.Ref<MenuToggleElement>) => (
        <MenuToggle
          ref={toggleRef}
          onClick={() => setIsOpen(!isOpen)}
          isExpanded={isOpen}
          isDisabled={!uuid || isExporting}
          variant='secondary'
          ouiaId='lightwell-coverage-export-toggle'
          aria-busy={isExporting}
          icon={isExporting ? <Spinner size='sm' aria-hidden='true' /> : undefined}
        >
          {isExporting ? 'Exporting' : 'Export'}
        </MenuToggle>
      )}
    >
      <DropdownList>
        <DropdownItem
          key='pdf'
          isDisabled={isExporting}
          onClick={() => {
            void handleExportPdf();
          }}
        >
          Export as PDF
        </DropdownItem>
      </DropdownList>
    </Dropdown>
  );
}
