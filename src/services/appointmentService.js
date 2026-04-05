const db = require('../models/db');

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
      throw Object.assign(new Error('Appointment date is required'), { status: 400 });
    }

    const holiday = await db('holidays')
      .where('holiday_date', appointmentDate)
      .first();

    if (holiday) {
      throw Object.assign(
        new Error(`Cannot book appointment on ${appointmentDate}: hospital holiday (${holiday.name})`),
        { status: 409 }
      );
    }

    data.provider_id = user.provider_id;
    data.created_by = user.id;
    const [appointment] = await db('appointments').insert(data).returning('*');
    return appointment;
  }

  static async cancel(id, user) {
    const appointment = await db('appointments').where({ id }).first();
    if (!appointment) {
      throw Object.assign(new Error('Appointment not found'), { status: 404 });
    }
    const [updated] = await db('appointments')
      .where({ id })
      .update({ status: 'cancelled', cancelled_by: user.id })
      .returning('*');
    return updated;
  }
}

module.exports = AppointmentService;
