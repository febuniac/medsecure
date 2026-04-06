const db = require('../models/db');
const { AppError, ErrorCodes } = require('../utils/errorCodes');

class ConsentService {
  static async getByPatient(patientId) {
    const consents = await db('consents').where({ patient_id: patientId }).orderBy('consented_at', 'desc');
    return consents;
  }

  static async create(data, user) {
    const consentRecord = {
      ...data,
      consented_at: new Date().toISOString(),
      created_by: user.id,
    };

    const [consent] = await db('consents').insert(consentRecord).returning('*');
    return consent;
  }

  static async revoke(id, user) {
    const consent = await db('consents').where({ id }).first();
    if (!consent) {
      throw new AppError(ErrorCodes.RECORD_NOT_FOUND, 'Consent record not found');
    }

    const [updated] = await db('consents')
      .where({ id })
      .update({
        status: 'revoked',
        revoked_at: new Date().toISOString(),
        revoked_by: user.id,
      })
      .returning('*');

    return updated;
  }
}

module.exports = ConsentService;
