import { http } from '@/libs/api/client';

import { cortexPayApi } from './api';

jest.mock('@/libs/api/client', () => ({
  http: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

describe('cortexPayApi - Reconciliation & Exports', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should call exportLedgerCsv with user_id query parameter', async () => {
    const mockCsv = 'Entry ID,Reference,Amount\n1,REF1,50000.0000';
    (http.get as jest.Mock).mockResolvedValueOnce(mockCsv);

    const res = await cortexPayApi.exportLedgerCsv('usr_123');

    expect(http.get).toHaveBeenCalledWith('/export/ledger/csv', {
      params: { limit: 1000, user_id: 'usr_123' },
      responseType: 'text',
    });
    expect(res).toBe(mockCsv);
  });

  it('should call exportReconciliationCsv with batch_id', async () => {
    const mockCsv = 'RECONCILIATION AUDIT REPORT\nBatch ID,REC_WAVE_001';
    (http.get as jest.Mock).mockResolvedValueOnce(mockCsv);

    const res = await cortexPayApi.exportReconciliationCsv('REC_WAVE_001');

    expect(http.get).toHaveBeenCalledWith('/export/reconciliation/REC_WAVE_001/csv', {
      responseType: 'text',
    });
    expect(res).toBe(mockCsv);
  });

  it('should call runReconciliation with partner payload', async () => {
    const mockResult = {
      batch_id: 'REC_WAVE_001',
      provider: 'WAVE',
      reconciliation_date: '2026-09-14',
      status: 'BALANCED',
      total_ledger: '50000.0000',
      total_partner: '50000.0000',
      discrepancy_total: '0.0000',
      matched_count: 1,
      discrepancy_count: 0,
      discrepancies: [],
    };
    (http.post as jest.Mock).mockResolvedValueOnce(mockResult);

    const res = await cortexPayApi.runReconciliation({
      provider: 'WAVE',
      reconciliation_date: '2026-09-14',
      partner_statements: [{ reference: 'REF1', amount: '50000.0000' }],
    });

    expect(http.post).toHaveBeenCalledWith('/reconciliation/run', {
      provider: 'WAVE',
      reconciliation_date: '2026-09-14',
      partner_statements: [{ reference: 'REF1', amount: '50000.0000' }],
    });
    expect(res).toEqual(mockResult);
  });
});
