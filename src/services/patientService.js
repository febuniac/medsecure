const db = require('../models/db');
const { encrypt, decrypt } = require('../utils/encryption');
const ProviderPatientService = require('./providerPatientService');
const { AppError, ErrorCodes } = require('../utils/errorCodes');

class PatientService {
  static _groupPatientsWithAppointments(rows) {
    const patientsMap = new Map();
    for (const row of rows) {
      const patientId = row.id;
      if (!patientsMap.has(patientId)) {
        patientsMap.set(patientId, {
          id: row.id,
          first_name: row.first_name,
          last_name: row.last_name,
          dob: row.dob,
          created_at: row.created_at,
          appointments: [],
        });
      }
      if (row.appointment_id) {
        patientsMap.get(patientId).appointments.push({
          id: row.appointment_id,
          appointment_date: row.appointment_date,
          status: row.appointment_status,
        });
      }
    }
    return Array.from(patientsMap.values());
  }

  static async list(filters, user) {
    let query = db('patients')
      .leftJoin('appointments', 'patients.id', 'appointments.patient_id')
      .select(
        'patients.id',
        'patients.first_name',
        'patients.last_name',
        'patients.dob',
        'patients.created_at',
        'appointments.id as appointment_id',
        'appointments.appointment_date',
        'appointments.status as appointment_status'
      );

    if (user.role !== 'admin') {
      const assignments = await db('provider_patient_assignments')
        .where({ provider_id: user.provider_id, status: 'active' })
        .select('patient_id');
      const patientIds = assignments.map(a => a.patient_id);
      if (patientIds.length === 0) return [];
      query = query.whereIn('patients.id', patientIds);
    }

    const rows = await query;
    return PatientService._groupPatientsWithAppointments(rows);
  }
  static async getById(id, user) {
    await ProviderPatientService.verifyAccess(user, id);
    const patient = await db('patients').where({ id }).first();
    if (!patient) {
      throw new AppError(ErrorCodes.PATIENT_NOT_FOUND, 'Patient not found');
    }
    patient.ssn = await decrypt(patient.ssn_encrypted);
    return patient;
  }
  static async create(data, user) {
    data.ssn_encrypted = await encrypt(data.ssn);
    delete data.ssn;
    return db('patients').insert(data).returning('*');
  }
  static async update(id, data, user) {
    await ProviderPatientService.verifyAccess(user, id);
    const [updated] = await db('patients').where({ id }).update(data).returning('*');
    if (!updated) {
      throw new AppError(ErrorCodes.PATIENT_NOT_FOUND, 'Patient not found');
    }
    return updated;
  }
}
module.exports = PatientService;
