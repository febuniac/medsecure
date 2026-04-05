const db = require('../models/db');

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

class RecordService {
  static async getByPatient(patientId, user, { page = DEFAULT_PAGE, limit = DEFAULT_LIMIT } = {}) {
    const sanitizedPage = Math.max(1, parseInt(page, 10) || DEFAULT_PAGE);
    const sanitizedLimit = Math.min(MAX_LIMIT, Math.max(1, parseInt(limit, 10) || DEFAULT_LIMIT));
    const offset = (sanitizedPage - 1) * sanitizedLimit;

    const [records, countResult] = await Promise.all([
      db('medical_records')
        .where({ patient_id: patientId })
        .orderBy('date', 'desc')
        .limit(sanitizedLimit)
        .offset(offset),
      db('medical_records')
        .where({ patient_id: patientId })
        .count('* as total')
        .first()
    ]);

    const total = parseInt(countResult.total, 10);

    return {
      data: records,
      pagination: {
        page: sanitizedPage,
        limit: sanitizedLimit,
        total,
        totalPages: Math.ceil(total / sanitizedLimit)
      }
    };
  }
  static async getById(id, user) {
    return db('medical_records').where({ id }).first();
  }
  static async create(data, user) {
    data.created_by = user.id;
    return db('medical_records').insert(data).returning('*');
  }
}
module.exports = RecordService;
