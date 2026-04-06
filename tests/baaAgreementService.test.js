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
      expect(BAA_STATUSES).toEqual(['active', 'expired', 'terminated', 'pending_renewal']);
    });
  });

  describe('create', () => {
    test('creates a BAA agreement with correct fields', async () => {
      const data = {
        vendor_name: 'Cloud Storage Inc.',
        description: 'Cloud storage for medical records',
        agreement_date: '2026-01-15',
        expiration_date: '2027-01-15',
        status: 'active',
        contract_reference: 'CONTRACT-2026-001'
      };

      const insertedAgreement = {
        id: 'baa-1',
        ...data,
        provider_id: 'provider-1',
        created_by: 'user-1'
      };

      const chain = mockMakeChain();
      chain.insert.mockReturnValue({
        returning: jest.fn().mockResolvedValue([insertedAgreement])
      });
      mockTableChains['baa_agreements'] = chain;

      const result = await BaaAgreementService.create(data, mockUser);

      expect(result).toEqual(insertedAgreement);
      expect(chain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          vendor_name: 'Cloud Storage Inc.',
          agreement_date: '2026-01-15',
          expiration_date: '2027-01-15',
          provider_id: 'provider-1',
          created_by: 'user-1'
        })
      );
    });

    test('defaults status to active when not provided', async () => {
      const data = {
        vendor_name: 'Lab Services LLC',
        agreement_date: '2026-03-01',
        expiration_date: '2027-03-01'
      };

      const chain = mockMakeChain();
      let capturedInsert;
      chain.insert.mockImplementation((insertData) => {
        capturedInsert = insertData;
        return { returning: jest.fn().mockResolvedValue([{ id: 'baa-2', ...insertData }]) };
      });
      mockTableChains['baa_agreements'] = chain;

      await BaaAgreementService.create(data, mockUser);

      expect(capturedInsert.status).toBe('active');
    });

    test('stores optional fields as null when not provided', async () => {
      const data = {
        vendor_name: 'Minimal Vendor',
        agreement_date: '2026-06-01',
        expiration_date: '2027-06-01'
      };

      const chain = mockMakeChain();
      let capturedInsert;
      chain.insert.mockImplementation((insertData) => {
        capturedInsert = insertData;
        return { returning: jest.fn().mockResolvedValue([{ id: 'baa-3', ...insertData }]) };
      });
      mockTableChains['baa_agreements'] = chain;

      await BaaAgreementService.create(data, mockUser);

      expect(capturedInsert.description).toBeNull();
      expect(capturedInsert.contract_reference).toBeNull();
      expect(capturedInsert.safeguards_required).toBeNull();
    });
  });

  describe('getById', () => {
    test('returns agreement by id scoped to provider', async () => {
      const agreement = {
        id: 'baa-1',
        vendor_name: 'Test Vendor',
        provider_id: 'provider-1'
      };

      const chain = mockMakeChain();
      chain.first.mockResolvedValue(agreement);
      mockTableChains['baa_agreements'] = chain;

      const result = await BaaAgreementService.getById('baa-1', mockUser);

      expect(result).toEqual(agreement);
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
    test('returns agreements ordered by expiration date', async () => {
      const agreements = [
        { id: 'baa-1', vendor_name: 'Vendor A', expiration_date: '2027-01-01' },
        { id: 'baa-2', vendor_name: 'Vendor B', expiration_date: '2027-06-01' }
      ];

      const chain = mockMakeChain();
      chain.orderBy.mockResolvedValue(agreements);
      mockTableChains['baa_agreements'] = chain;

      const result = await BaaAgreementService.list({}, mockUser);
      expect(result).toEqual(agreements);
      expect(chain.orderBy).toHaveBeenCalledWith('expiration_date', 'asc');
    });

    test('filters by status when provided', async () => {
      const chain = mockMakeChain();
      chain.orderBy.mockResolvedValue([]);
      mockTableChains['baa_agreements'] = chain;

      await BaaAgreementService.list({ status: 'active' }, mockUser);

      expect(chain.where).toHaveBeenCalledWith({ provider_id: 'provider-1' });
      expect(chain.where).toHaveBeenCalledWith({ status: 'active' });
    });

    test('filters by vendor name when provided', async () => {
      const chain = mockMakeChain();
      chain.orderBy.mockResolvedValue([]);
      mockTableChains['baa_agreements'] = chain;

      await BaaAgreementService.list({ vendor_name: 'Cloud' }, mockUser);

      expect(chain.where).toHaveBeenCalledWith('vendor_name', 'ilike', '%Cloud%');
    });
  });

  describe('update', () => {
    test('updates agreement fields', async () => {
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
      const existing = { id: 'baa-1', vendor_name: 'Vendor', status: 'active', provider_id: 'provider-1' };
      const chain = mockMakeChain();
      chain.first.mockResolvedValue(existing);
      chain.update.mockReturnValue({
        returning: jest.fn().mockResolvedValue([{ ...existing, status: 'terminated' }])
      });
      mockTableChains['baa_agreements'] = chain;

      const result = await BaaAgreementService.terminate('baa-1', mockUser);

      expect(result.status).toBe('terminated');
    });

    test('returns null when agreement not found', async () => {
      const chain = mockMakeChain();
      chain.first.mockResolvedValue(undefined);
      mockTableChains['baa_agreements'] = chain;

      const result = await BaaAgreementService.terminate('nonexistent', mockUser);
      expect(result).toBeNull();
    });
  });

  describe('getExpiringSoon', () => {
    test('queries agreements expiring within given days', async () => {
      const chain = mockMakeChain();
      chain.orderBy.mockResolvedValue([]);
      mockTableChains['baa_agreements'] = chain;

      await BaaAgreementService.getExpiringSoon(mockUser, 30);

      expect(chain.where).toHaveBeenCalledWith({ provider_id: 'provider-1' });
      expect(chain.whereIn).toHaveBeenCalledWith('status', ['active', 'pending_renewal']);
      expect(chain.orderBy).toHaveBeenCalledWith('expiration_date', 'asc');
    });

    test('defaults to 30 days when not specified', async () => {
      const chain = mockMakeChain();
      chain.orderBy.mockResolvedValue([]);
      mockTableChains['baa_agreements'] = chain;

      await BaaAgreementService.getExpiringSoon(mockUser);

      expect(chain.whereIn).toHaveBeenCalledWith('status', ['active', 'pending_renewal']);
    });
  });

  describe('getExpired', () => {
    test('queries active agreements past expiration date', async () => {
      const chain = mockMakeChain();
      chain.orderBy.mockResolvedValue([]);
      mockTableChains['baa_agreements'] = chain;

      await BaaAgreementService.getExpired(mockUser);

      expect(chain.where).toHaveBeenCalledWith({ provider_id: 'provider-1', status: 'active' });
      expect(chain.orderBy).toHaveBeenCalledWith('expiration_date', 'asc');
    });
  });
});
