const db = require('../models/db');
const { encrypt, decrypt } = require('../utils/encryption');
const ProviderPatientService = require('./providerPatientService');

class PatientService {
  static async list(filters, user) {
    if (user.role === 'admin') {
      return db('patients').select('id', 'first_name', 'last_name', 'dob', 'created_at');
    }
    // Only return patients assigned to this provider
    return db('patients')
      .join('provider_patient_assignments', function () {
        this.on('patients.id', '=', 'provider_patient_assignments.patient_id')
          .andOn('provider_patient_assignments.status', '=', db.raw("'active'"));
      })
      .where({ 'provider_patient_assignments.provider_id': user.provider_id })
      .select('patients.id', 'patients.first_name', 'patients.last_name', 'patients.dob', 'patients.created_at');
  }

  static async getById(id, user) {
    const hasAccess = await ProviderPatientService.verifyAccess(user, id);
    if (!hasAccess) {
      const error = new Error('Access denied: you are not assigned to this patient');
      error.status = 403;
      throw error;
    }
    const patient = await db('patients').where({ id }).first();
    if (patient) { patient.ssn = decrypt(patient.ssn_encrypted); }
    return patient;
  }

  static async create(data, user) {
    data.ssn_encrypted = encrypt(data.ssn);
    delete data.ssn;
    data.created_by = user.id;
    const [patient] = await db('patients').insert(data).returning('*');
    // Automatically assign the creating provider to this patient
    await ProviderPatientService.assign(
      { provider_id: user.provider_id, patient_id: patient.id },
      user
    );
    return patient;
  }

  static async update(id, data, user) {
    const hasAccess = await ProviderPatientService.verifyAccess(user, id);
    if (!hasAccess) {
      const error = new Error('Access denied: you are not assigned to this patient');
      error.status = 403;
      throw error;
    }
    const [updated] = await db('patients').where({ id }).update(data).returning('*');
    return updated;
  }
}
module.exports = PatientService;
