const db = require('../models/db');
const ProviderPatientService = require('./providerPatientService');
const { AppError, ErrorCodes } = require('../utils/errorCodes');

class RecordService {
  static async getByPatient(patientId, user) {
    await ProviderPatientService.verifyAccess(user, patientId);
    return db('medical_records').where({ patient_id: patientId }).orderBy('date', 'desc');
  }
  static async getById(id, user) {
    const record = await db('medical_records').where({ id }).first();
    if (!record) {
      throw new AppError(ErrorCodes.RECORD_NOT_FOUND, 'Record not found');
    }
    await ProviderPatientService.verifyAccess(user, record.patient_id);
    return record;
  }
  static async create(data, user) {
    await ProviderPatientService.verifyAccess(user, data.patient_id);
    data.created_by = user.id;
    return db('medical_records').insert(data).returning('*');
  }
}
module.exports = RecordService;
