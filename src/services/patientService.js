const db = require('../models/db');
const { encrypt, decrypt } = require('../utils/encryption');
const ProviderPatientService = require('./providerPatientService');
const { AppError, ErrorCodes } = require('../utils/errorCodes');

class PatientService {
  static async list(filters, user) {
    if (user.role === 'admin') {
      return db('patients').select('id', 'first_name', 'last_name', 'dob', 'created_at');
    }
    const assignments = await db('provider_patient_assignments')
      .where({ provider_id: user.provider_id, status: 'active' })
      .select('patient_id');
    const patientIds = assignments.map(a => a.patient_id);
    if (patientIds.length === 0) return [];
    return db('patients').whereIn('id', patientIds).select('id', 'first_name', 'last_name', 'dob', 'created_at');
  }
  static async getById(id, user) {
    await ProviderPatientService.verifyAccess(user, id);
    const patient = await db('patients').where({ id }).first();
    if (patient) { patient.ssn = decrypt(patient.ssn_encrypted); }
    return patient;
  }
  static async create(data, user) {
    data.ssn_encrypted = encrypt(data.ssn);
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
