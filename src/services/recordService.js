const db = require('../models/db');
const ProviderPatientService = require('./providerPatientService');

class RecordService {
  static async getByPatient(patientId, user) {
    const hasAccess = await ProviderPatientService.verifyAccess(user, patientId);
    if (!hasAccess) {
      const error = new Error('Access denied: you are not assigned to this patient');
      error.status = 403;
      throw error;
    }
    return db('medical_records').where({ patient_id: patientId }).orderBy('date', 'desc');
  }

  static async getById(id, user) {
    const record = await db('medical_records').where({ id }).first();
    if (!record) {
      return null;
    }
    const hasAccess = await ProviderPatientService.verifyAccess(user, record.patient_id);
    if (!hasAccess) {
      const error = new Error('Access denied: you are not assigned to this patient');
      error.status = 403;
      throw error;
    }
    return record;
  }

  static async create(data, user) {
    const hasAccess = await ProviderPatientService.verifyAccess(user, data.patient_id);
    if (!hasAccess) {
      const error = new Error('Access denied: you are not assigned to this patient');
      error.status = 403;
      throw error;
    }
    data.created_by = user.id;
    return db('medical_records').insert(data).returning('*');
  }
}
module.exports = RecordService;
