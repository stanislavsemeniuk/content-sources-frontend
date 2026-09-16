import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AlertVariant } from '@patternfly/react-core';
import axios from 'axios';

import { ExportMenu, fetchAllFilteredCoveragePackages } from './ExportMenu';
import { getCoverageReportPackages } from 'services/Lightwell/CoverageReportsApi';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

jest.mock('services/Lightwell/CoverageReportsApi', () => {
  const actual = jest.requireActual('services/Lightwell/CoverageReportsApi');
  return {
    ...actual,
    getCoverageReportPackages: jest.fn(),
  };
});

jest.mock('Hooks/useErrorNotification', () => ({
  __esModule: true,
  default: () => jest.fn(),
}));

jest.mock('Hooks/useNotification', () => ({
  __esModule: true,
  default: jest.fn(),
}));

import useNotification from 'Hooks/useNotification';

const notify = jest.fn();
const mockedGetPackages = getCoverageReportPackages as jest.Mock;

const PACKAGES = [
  { name: 'spring-web', version: '6.1.5', ecosystem: 'Java', covered: true, match_status: 'exact' },
];

const PACKAGES_RESPONSE = {
  data: PACKAGES,
  links: { first: '', last: '' },
  meta: { count: 1, limit: 200, offset: 0 },
};

const SUMMARY = { total: 100, exact_matches: 60, partial_matches: 15, unmatched: 25 };

const renderMenu = () =>
  render(
    <ExportMenu
      uuid='test-uuid'
      ecosystems={['Java', 'Python', 'npm']}
      filename='sbom.json'
      summary={SUMMARY}
    />,
  );

beforeEach(() => {
  (useNotification as jest.Mock).mockReturnValue({ notify });
  notify.mockClear();
  mockedAxios.post.mockReset();
  mockedGetPackages.mockReset();
  URL.createObjectURL = jest.fn().mockReturnValue('blob:mock');
  URL.revokeObjectURL = jest.fn();
});

describe('fetchAllFilteredCoveragePackages', () => {
  it('fetches all pages and returns the flattened package list', async () => {
    mockedGetPackages.mockResolvedValueOnce(PACKAGES_RESPONSE);

    const result = await fetchAllFilteredCoveragePackages('test-uuid', ['Java']);

    expect(result).toHaveLength(1);
    expect(mockedGetPackages).toHaveBeenCalledWith('test-uuid', 1, expect.any(Number), undefined);
  });
});

describe('ExportMenu PDF', () => {
  it('offers only a PDF export option', async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.click(screen.getByRole('button', { name: 'Export' }));

    expect(screen.getByRole('menuitem', { name: 'Export as PDF' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /CSV/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /JSON/ })).not.toBeInTheDocument();
  });

  it('fetches packages then posts them to the PDF server', async () => {
    mockedGetPackages.mockResolvedValue(PACKAGES_RESPONSE);
    const pdfBlob = new Blob(['%PDF-1.4'], { type: 'application/pdf' });
    mockedAxios.post.mockResolvedValue({ data: pdfBlob });

    const user = userEvent.setup();
    renderMenu();

    await user.click(screen.getByRole('button', { name: 'Export' }));
    await user.click(screen.getByRole('menuitem', { name: 'Export as PDF' }));

    await waitFor(() => {
      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    });

    expect(mockedGetPackages).toHaveBeenCalled();
    expect(mockedAxios.post).toHaveBeenCalledWith(
      '/pdf/coverage',
      { filename: 'sbom.json', summary: SUMMARY, data: { packages: PACKAGES } },
      { responseType: 'blob' },
    );
    expect(URL.createObjectURL).toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock');
  });

  it('closes the menu and shows generating feedback while the PDF is in progress', async () => {
    mockedGetPackages.mockResolvedValue(PACKAGES_RESPONSE);
    let resolvePost: (value: { data: Blob }) => void = () => undefined;
    mockedAxios.post.mockReturnValue(
      new Promise<{ data: Blob }>((resolve) => {
        resolvePost = resolve;
      }),
    );

    const user = userEvent.setup();
    renderMenu();

    await user.click(screen.getByRole('button', { name: 'Export' }));
    await user.click(screen.getByRole('menuitem', { name: 'Export as PDF' }));

    await waitFor(() => {
      expect(screen.queryByRole('menuitem', { name: 'Export as PDF' })).not.toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Exporting' })).toBeDisabled();
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: AlertVariant.info,
        title: 'Generating PDF',
      }),
    );

    resolvePost({ data: new Blob(['%PDF-1.4'], { type: 'application/pdf' }) });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Export' })).toBeEnabled();
    });
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: AlertVariant.success,
        title: 'PDF ready',
      }),
    );
  });
});
