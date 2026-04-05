const AppointmentService = require('../appointmentService');
const db = require('../../models/db');

jest.mock('../../models/db', () => {
  const mKnex = jest.fn();
  mKnex.mockReturnValue({
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    returning: jest.fn(),
    first: jest.fn(),
    select: jest.fn(),
  });
  return mKnex;
});

describe('AppointmentService', () => {
  const mockUser = { id: 'user-1', provider_id: 'provider-1' };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should reject appointment on a hospital holiday', async () => {
      const holidayQuery = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue({ holiday_date: '2026-12-25', name: 'Christmas Day' }),
      };
      const appointmentsQuery = {
        where: jest.fn().mockReturnThis(),
        insert: jest.fn().mockReturnThis(),
        returning: jest.fn().mockResolvedValue([{ id: 1 }]),
      };

      db.mockImplementation((table) => {
        if (table === 'holidays') return holidayQuery;
        if (table === 'appointments') return appointmentsQuery;
        return {};
      });

      const data = { appointment_date: '2026-12-25', patient_id: 'patient-1' };

      await expect(AppointmentService.create(data, mockUser)).rejects.toThrow(
        'Cannot book appointment on 2026-12-25: hospital holiday (Christmas Day)'
      );
      expect(holidayQuery.where).toHaveBeenCalledWith('holiday_date', '2026-12-25');
      expect(appointmentsQuery.insert).not.toHaveBeenCalled();
    });

    it('should reject appointment on a holiday with status 409', async () => {
      const holidayQuery = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue({ holiday_date: '2026-01-01', name: "New Year's Day" }),
      };

      db.mockImplementation((table) => {
        if (table === 'holidays') return holidayQuery;
        return {};
      });

      const data = { appointment_date: '2026-01-01', patient_id: 'patient-1' };

      try {
        await AppointmentService.create(data, mockUser);
        fail('Expected an error to be thrown');
      } catch (err) {
        expect(err.status).toBe(409);
        expect(err.message).toContain('hospital holiday');
      }
    });

    it('should allow appointment on a non-holiday date', async () => {
      const holidayQuery = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(undefined),
      };
      const appointmentsQuery = {
        insert: jest.fn().mockReturnThis(),
        returning: jest.fn().mockResolvedValue([{
          id: 1,
          appointment_date: '2026-06-15',
          patient_id: 'patient-1',
          provider_id: 'provider-1',
          created_by: 'user-1',
        }]),
      };

      db.mockImplementation((table) => {
        if (table === 'holidays') return holidayQuery;
        if (table === 'appointments') return appointmentsQuery;
        return {};
      });

      const data = { appointment_date: '2026-06-15', patient_id: 'patient-1' };
      const result = await AppointmentService.create(data, mockUser);

      expect(result).toEqual(expect.objectContaining({ appointment_date: '2026-06-15' }));
      expect(appointmentsQuery.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          appointment_date: '2026-06-15',
          provider_id: 'provider-1',
          created_by: 'user-1',
        })
      );
    });

    it('should reject appointment without a date', async () => {
      const data = { patient_id: 'patient-1' };

      await expect(AppointmentService.create(data, mockUser)).rejects.toThrow(
        'Appointment date is required'
      );
    });

    it('should reject appointment without a date with status 400', async () => {
      const data = { patient_id: 'patient-1' };

      try {
        await AppointmentService.create(data, mockUser);
        fail('Expected an error to be thrown');
      } catch (err) {
        expect(err.status).toBe(400);
      }
    });
  });

  describe('list', () => {
    it('should list appointments for user provider', async () => {
      const mockQuery = {
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockResolvedValue([{ id: 1 }, { id: 2 }]),
      };

      db.mockImplementation(() => mockQuery);

      const result = await AppointmentService.list({}, mockUser);
      expect(db).toHaveBeenCalledWith('appointments');
      expect(mockQuery.where).toHaveBeenCalledWith({ provider_id: 'provider-1' });
      expect(result).toHaveLength(2);
    });
  });

  describe('cancel', () => {
    it('should return 404 for non-existent appointment', async () => {
      const mockQuery = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(undefined),
      };

      db.mockImplementation(() => mockQuery);

      try {
        await AppointmentService.cancel('non-existent', mockUser);
        fail('Expected an error to be thrown');
      } catch (err) {
        expect(err.status).toBe(404);
        expect(err.message).toBe('Appointment not found');
      }
    });
  });
});
