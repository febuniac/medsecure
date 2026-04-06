const db = require('../models/db');
const { AppError, ErrorCodes } = require('../utils/errorCodes');

class AppointmentService {
  static async list(filters, user) {
    const query = db('appointments').where({ provider_id: user.provider_id });
    if (filters.date) {
      query.where('appointment_date', filters.date);
    }
    if (filters.status) {
      query.where('status', filters.status);
    }
    return query.orderBy('appointment_date', 'asc');
  }

  static async create(data, user) {
    const appointmentDate = data.appointment_date;
    if (!appointmentDate) {
      throw new AppError(ErrorCodes.MISSING_REQUIRED_FIELDS, 'Appointment date is required');
    }

    const holiday = await db('holidays')
      .where('holiday_date', appointmentDate)
      .first();

    if (holiday) {
      throw new AppError(ErrorCodes.HOLIDAY_CONFLICT, `Cannot book appointment on ${appointmentDate}: hospital holiday (${holiday.name})`);
    }

    data.provider_id = user.provider_id;
    data.created_by = user.id;
    const [appointment] = await db('appointments').insert(data).returning('*');
    return appointment;
  }

  static async cancel(id, user) {
    const appointment = await db('appointments').where({ id }).first();
    if (!appointment) {
      throw new AppError(ErrorCodes.APPOINTMENT_NOT_FOUND, 'Appointment not found');
    }
    const [updated] = await db('appointments')
      .where({ id })
      .update({ status: 'cancelled', cancelled_by: user.id })
      .returning('*');
    return updated;
  }
}

module.exports = AppointmentService;
