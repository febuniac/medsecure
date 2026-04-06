const AppointmentService = require('../src/services/appointmentService');
const db = require('../src/models/db');

jest.mock('../src/models/db', () => {
  const mKnex = jest.fn();
  return mKnex;
});

describe('AppointmentService.list pagination', () => {
  const mockUser = { id: 'user-1', provider_id: 'provider-1' };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  function buildMockQuery(rows, total) {
    const query = {
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      offset: jest.fn().mockResolvedValue(rows),
      clone: jest.fn(),
      count: jest.fn().mockResolvedValue([{ count: String(total) }]),
    };
    query.clone.mockReturnValue({
      count: jest.fn().mockResolvedValue([{ count: String(total) }]),
    });
    return query;
  }

  it('should use default limit=20 and offset=0 when no params provided', async () => {
    const mockRows = [{ id: 1 }, { id: 2 }];
    const mockQuery = buildMockQuery(mockRows, 2);
    db.mockImplementation(() => mockQuery);

    const result = await AppointmentService.list({}, mockUser);

    expect(result).toEqual({
      data: mockRows,
      total: 2,
      limit: 20,
      offset: 0,
    });
    expect(mockQuery.limit).toHaveBeenCalledWith(20);
    expect(mockQuery.offset).toHaveBeenCalledWith(0);
  });

  it('should accept custom limit and offset', async () => {
    const mockRows = [{ id: 3 }];
    const mockQuery = buildMockQuery(mockRows, 50);
    db.mockImplementation(() => mockQuery);

    const result = await AppointmentService.list({ limit: '10', offset: '20' }, mockUser);

    expect(result).toEqual({
      data: mockRows,
      total: 50,
      limit: 10,
      offset: 20,
    });
    expect(mockQuery.limit).toHaveBeenCalledWith(10);
    expect(mockQuery.offset).toHaveBeenCalledWith(20);
  });

  it('should cap limit at 100', async () => {
    const mockQuery = buildMockQuery([], 0);
    db.mockImplementation(() => mockQuery);

    const result = await AppointmentService.list({ limit: '500' }, mockUser);

    expect(result.limit).toBe(100);
    expect(mockQuery.limit).toHaveBeenCalledWith(100);
  });

  it('should enforce minimum limit of 1', async () => {
    const mockQuery = buildMockQuery([], 0);
    db.mockImplementation(() => mockQuery);

    const result = await AppointmentService.list({ limit: '0' }, mockUser);

    expect(result.limit).toBe(1);
    expect(mockQuery.limit).toHaveBeenCalledWith(1);
  });

  it('should enforce minimum offset of 0', async () => {
    const mockQuery = buildMockQuery([], 0);
    db.mockImplementation(() => mockQuery);

    const result = await AppointmentService.list({ offset: '-5' }, mockUser);

    expect(result.offset).toBe(0);
    expect(mockQuery.offset).toHaveBeenCalledWith(0);
  });

  it('should default invalid limit to 20', async () => {
    const mockQuery = buildMockQuery([], 0);
    db.mockImplementation(() => mockQuery);

    const result = await AppointmentService.list({ limit: 'abc' }, mockUser);

    expect(result.limit).toBe(20);
    expect(mockQuery.limit).toHaveBeenCalledWith(20);
  });

  it('should default invalid offset to 0', async () => {
    const mockQuery = buildMockQuery([], 0);
    db.mockImplementation(() => mockQuery);

    const result = await AppointmentService.list({ offset: 'xyz' }, mockUser);

    expect(result.offset).toBe(0);
    expect(mockQuery.offset).toHaveBeenCalledWith(0);
  });

  it('should still apply date and status filters with pagination', async () => {
    const mockRows = [{ id: 1 }];
    const mockQuery = buildMockQuery(mockRows, 1);
    db.mockImplementation(() => mockQuery);

    const result = await AppointmentService.list(
      { date: '2026-06-15', status: 'confirmed', limit: '5', offset: '10' },
      mockUser
    );

    expect(result).toEqual({
      data: mockRows,
      total: 1,
      limit: 5,
      offset: 10,
    });
    expect(mockQuery.where).toHaveBeenCalledWith({ provider_id: 'provider-1' });
    expect(mockQuery.where).toHaveBeenCalledWith('appointment_date', '2026-06-15');
    expect(mockQuery.where).toHaveBeenCalledWith('status', 'confirmed');
  });

  it('should return total count independent of limit/offset', async () => {
    const mockRows = [{ id: 1 }];
    const mockQuery = buildMockQuery(mockRows, 150);
    db.mockImplementation(() => mockQuery);

    const result = await AppointmentService.list({ limit: '1', offset: '0' }, mockUser);

    expect(result.total).toBe(150);
    expect(result.data).toHaveLength(1);
  });
});
