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

  it('should call openDispute and validate returned schema', async () => {
    const mockDispute = {
      id: 'disp-uuid-1',
      dispute_id: 'DISP_ABC123',
      transaction_reference: 'TX_123',
      card_id: 'card_456',
      user_id: 'usr_789',
      amount: '25.0000',
      currency: 'USD',
      reason: 'FRAUD_OR_UNAUTHORIZED_CHARGE',
      description: 'Unauthorized recurring fee',
      status: 'OPENED',
      created_at: new Date().toISOString(),
    };
    (http.post as jest.Mock).mockResolvedValueOnce(mockDispute);

    const res = await cortexPayApi.openDispute({
      user_id: 'usr_789',
      transaction_reference: 'TX_123',
      card_id: 'card_456',
      amount: '25.00',
      reason: 'FRAUD_OR_UNAUTHORIZED_CHARGE',
      description: 'Unauthorized recurring fee',
    });

    expect(http.post).toHaveBeenCalledWith('/disputes/open', expect.objectContaining({
      transaction_reference: 'TX_123',
      card_id: 'card_456',
    }));
    expect(res.status).toBe('OPENED');
    expect(res.dispute_id).toBe('DISP_ABC123');
  });

  it('should call resolveDispute and return terminal state', async () => {
    const mockResolved = {
      id: 'disp-uuid-1',
      dispute_id: 'DISP_ABC123',
      transaction_reference: 'TX_123',
      card_id: 'card_456',
      user_id: 'usr_789',
      amount: '25.0000',
      currency: 'USD',
      reason: 'FRAUD_OR_UNAUTHORIZED_CHARGE',
      status: 'WON_REFUNDED',
      resolution_notes: 'Chargeback confirmed by merchant bank',
      created_at: new Date().toISOString(),
    };
    (http.post as jest.Mock).mockResolvedValueOnce(mockResolved);

    const res = await cortexPayApi.resolveDispute('DISP_ABC123', 'WON', 'Chargeback confirmed by merchant bank');

    expect(http.post).toHaveBeenCalledWith('/disputes/DISP_ABC123/resolve', {
      decision: 'WON',
      resolution_notes: 'Chargeback confirmed by merchant bank',
    });
    expect(res.status).toBe('WON_REFUNDED');
  });
});
