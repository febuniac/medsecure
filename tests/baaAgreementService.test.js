const mockTableChains = {};

function mockMakeChain() {
  return {
    where: jest.fn().mockReturnThis(),
    whereIn: jest.fn().mockReturnThis(),
    whereNotIn: jest.fn().mockReturnThis(),
    whereBetween: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockResolvedValue([]),
    select: jest.fn().mockReturnThis(),
    first: jest.fn().mockResolvedValue(null),
    insert: jest.fn().mockReturnValue({ returning: jest.fn().mockResolvedValue([{}]) }),
    update: jest.fn().mockReturnValue({ returning: jest.fn().mockResolvedValue([{}]) })
  };
}

jest.mock('../src/models/db', () => {
  return jest.fn((tableName) => {
    if (!mockTableChains[tableName]) {
      mockTableChains[tableName] = mockMakeChain();
    }
    return mockTableChains[tableName];
  });
});

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
}));

const BaaAgreementService = require('../src/services/baaAgreementService');
const { BAA_STATUSES } = require('../src/services/baaAgreementService');

const mockUser = { id: 'user-1', provider_id: 'provider-1' };

beforeEach(() => {
  jest.clearAllMocks();
  for (const key of Object.keys(mockTableChains)) {
    delete mockTableChains[key];
  }
});

describe('BaaAgreementService', () => {
  describe('Constants', () => {
    test('BAA_STATUSES contains all required statuses', () => {
      expect(BAA_STATUSES).toEqual([
        'draft', 'active', 'expired', 'terminated', 'pending_renewal'
      ]);
    });
  });

  describe('create', () => {
    test('creates a BAA agreement with required fields', async () => {
      const baaData = {
        vendor_name: 'Cloud Health Inc.',
        agreement_date: '2026-01-15T00:00:00.000Z',
        expiration_date: '2027-01-15T00:00:00.000Z',
        description: 'Cloud storage for PHI data',
        phi_types_shared: ['medical_records', 'billing_info']
      };

      const insertedAgreement = {
        id: 'baa-1',
        ...baaData,
        status: 'active',
        provider_id: 'provider-1',
        created_by: 'user-1'
      };

      const chain = mockMakeChain();
      chain.insert.mockReturnValue({
        returning: jest.fn().mockResolvedValue([insertedAgreement])
      });
      mockTableChains['baa_agreements'] = chain;

      const result = await BaaAgreementService.create(baaData, mockUser);

      expect(result).toEqual(insertedAgreement);
      expect(chain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          vendor_name: 'Cloud Health Inc.',
          agreement_date: '2026-01-15T00:00:00.000Z',
          expiration_date: '2027-01-15T00:00:00.000Z',
          status: 'active',
          provider_id: 'provider-1',
          created_by: 'user-1'
        })
      );
    });

    test('defaults status to active', async () => {
      const baaData = {
        vendor_name: 'Test Vendor',
        agreement_date: '2026-01-01T00:00:00.000Z',
        expiration_date: '2027-01-01T00:00:00.000Z'
      };

      const chain = mockMakeChain();
      let capturedInsert;
      chain.insert.mockImplementation((data) => {
        capturedInsert = data;
        return { returning: jest.fn().mockResolvedValue([{ id: 'baa-2', ...data }]) };
      });
      mockTableChains['baa_agreements'] = chain;

      await BaaAgreementService.create(baaData, mockUser);

      expect(capturedInsert.status).toBe('active');
    });

    test('serializes phi_types_shared as JSON', async () => {
      const baaData = {
        vendor_name: 'Test Vendor',
        agreement_date: '2026-01-01T00:00:00.000Z',
        expiration_date: '2027-01-01T00:00:00.000Z',
        phi_types_shared: ['ssn', 'medical_records']
      };

      const chain = mockMakeChain();
      let capturedInsert;
      chain.insert.mockImplementation((data) => {
        capturedInsert = data;
        return { returning: jest.fn().mockResolvedValue([{ id: 'baa-3', ...data }]) };
      });
      mockTableChains['baa_agreements'] = chain;

      await BaaAgreementService.create(baaData, mockUser);

      expect(capturedInsert.phi_types_shared).toBe('["ssn","medical_records"]');
    });
  });

  describe('getById', () => {
    test('returns agreement by id scoped to provider', async () => {
      const agreement = {
        id: 'baa-1',
        vendor_name: 'Test Vendor',
        provider_id: 'provider-1',
        phi_types_shared: '["ssn","dob"]'
      };

      const chain = mockMakeChain();
      chain.first.mockResolvedValue(agreement);
      mockTableChains['baa_agreements'] = chain;

      const result = await BaaAgreementService.getById('baa-1', mockUser);

      expect(result.phi_types_shared).toEqual(['ssn', 'dob']);
      expect(chain.where).toHaveBeenCalledWith({ id: 'baa-1', provider_id: 'provider-1' });
    });

    test('returns null when agreement not found', async () => {
      const chain = mockMakeChain();
      chain.first.mockResolvedValue(undefined);
      mockTableChains['baa_agreements'] = chain;

      const result = await BaaAgreementService.getById('nonexistent', mockUser);
      expect(result).toBeNull();
    });
  });

  describe('list', () => {
    test('lists agreements scoped to provider', async () => {
      const agreements = [
        { id: 'baa-1', vendor_name: 'Vendor A', status: 'active', phi_types_shared: '["ssn"]' },
        { id: 'baa-2', vendor_name: 'Vendor B', status: 'expired', phi_types_shared: '[]' }
      ];

      const chain = mockMakeChain();
      chain.orderBy.mockResolvedValue(agreements);
      mockTableChains['baa_agreements'] = chain;

      const result = await BaaAgreementService.list({}, mockUser);

      expect(result).toHaveLength(2);
      expect(result[0].phi_types_shared).toEqual(['ssn']);
      expect(result[1].phi_types_shared).toEqual([]);
    });

    test('filters by status when provided', async () => {
      const chain = mockMakeChain();
      chain.orderBy.mockResolvedValue([]);
      mockTableChains['baa_agreements'] = chain;

      await BaaAgreementService.list({ status: 'active' }, mockUser);

      expect(chain.where).toHaveBeenCalledWith({ status: 'active' });
    });
  });

  describe('update', () => {
    test('updates an existing agreement', async () => {
      const existing = { id: 'baa-1', vendor_name: 'Old Name', provider_id: 'provider-1' };

      const chain = mockMakeChain();
      chain.first.mockResolvedValue(existing);
      chain.update.mockReturnValue({
        returning: jest.fn().mockResolvedValue([{ ...existing, vendor_name: 'New Name' }])
      });
      mockTableChains['baa_agreements'] = chain;

      const result = await BaaAgreementService.update('baa-1', { vendor_name: 'New Name' }, mockUser);

      expect(result.vendor_name).toBe('New Name');
    });

    test('returns null when agreement not found', async () => {
      const chain = mockMakeChain();
      chain.first.mockResolvedValue(undefined);
      mockTableChains['baa_agreements'] = chain;

      const result = await BaaAgreementService.update('nonexistent', { vendor_name: 'x' }, mockUser);
      expect(result).toBeNull();
    });
  });

  describe('terminate', () => {
    test('sets status to terminated', async () => {
      const existing = { id: 'baa-1', vendor_name: 'Test Vendor', status: 'active', provider_id: 'provider-1' };

      const chain = mockMakeChain();
      chain.first.mockResolvedValue(existing);
      chain.update.mockReturnValue({
        returning: jest.fn().mockResolvedValue([{ ...existing, status: 'terminated' }])
      });
      mockTableChains['baa_agreements'] = chain;

      const result = await BaaAgreementService.terminate('baa-1', mockUser);

      expect(result.status).toBe('terminated');
      expect(chain.update).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'terminated' })
      );
    });

    test('returns null when agreement not found', async () => {
      const chain = mockMakeChain();
      chain.first.mockResolvedValue(undefined);
      mockTableChains['baa_agreements'] = chain;

      const result = await BaaAgreementService.terminate('nonexistent', mockUser);
      expect(result).toBeNull();
    });
  });

  describe('getExpiring', () => {
    test('queries for active/pending_renewal agreements expiring within given days', async () => {
      const chain = mockMakeChain();
      chain.orderBy.mockResolvedValue([]);
      mockTableChains['baa_agreements'] = chain;

      await BaaAgreementService.getExpiring(mockUser, 30);

      expect(chain.where).toHaveBeenCalledWith({ provider_id: 'provider-1' });
      expect(chain.whereIn).toHaveBeenCalledWith('status', ['active', 'pending_renewal']);
    });
  });

  describe('getExpired', () => {
    test('queries for active agreements past expiration date', async () => {
      const chain = mockMakeChain();
      chain.orderBy.mockResolvedValue([]);
      mockTableChains['baa_agreements'] = chain;

      await BaaAgreementService.getExpired(mockUser);

      expect(chain.where).toHaveBeenCalledWith(
        expect.objectContaining({ provider_id: 'provider-1', status: 'active' })
      );
    });
  });

  describe('getSummary', () => {
    test('returns structured summary with breakdowns', async () => {
      const now = new Date();
      const in15Days = new Date(now);
      in15Days.setDate(in15Days.getDate() + 15);
      const in60Days = new Date(now);
      in60Days.setDate(in60Days.getDate() + 60);
      const pastDate = new Date(now);
      pastDate.setDate(pastDate.getDate() - 10);

      const agreements = [
        { id: '1', vendor_name: 'Vendor A', status: 'active', agreement_date: '2025-01-01', expiration_date: in15Days.toISOString() },
        { id: '2', vendor_name: 'Vendor B', status: 'active', agreement_date: '2025-06-01', expiration_date: in60Days.toISOString() },
        { id: '3', vendor_name: 'Vendor C', status: 'terminated', agreement_date: '2024-01-01', expiration_date: pastDate.toISOString() },
        { id: '4', vendor_name: 'Vendor D', status: 'active', agreement_date: '2024-06-01', expiration_date: pastDate.toISOString() }
      ];

      const chain = mockMakeChain();
      chain.orderBy.mockResolvedValue(agreements);
      mockTableChains['baa_agreements'] = chain;

      const result = await BaaAgreementService.getSummary(mockUser);

      expect(result.total).toBe(4);
      expect(result.by_status.active).toBe(3);
      expect(result.by_status.terminated).toBe(1);
      expect(result.expiring_within_30_days).toBe(1);
      expect(result.expired_but_active).toBe(1);
      expect(result.agreements).toHaveLength(4);
    });
  });
});
