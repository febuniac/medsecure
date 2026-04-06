const db = require('../models/db');
const ProviderPatientService = require('./providerPatientService');
const { ImageStorageService } = require('./imageStorageService');
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
    if (data.image_data) {
      delete data.image_data;
    }
    return db('medical_records').insert(data).returning('*');
  }
  static async attachImage(recordId, user, imageBuffer, fileName, contentType) {
    const record = await db('medical_records').where({ id: recordId }).first();
    if (!record) {
      throw new AppError(ErrorCodes.RECORD_NOT_FOUND, 'Record not found');
    }
    await ProviderPatientService.verifyAccess(user, record.patient_id);

    const result = await ImageStorageService.upload(
      record.patient_id,
      imageBuffer,
      fileName,
      contentType
    );

    const [updated] = await db('medical_records')
      .where({ id: recordId })
      .update({
        image_storage_key: result.storageKey,
        image_bucket: result.bucket,
        image_content_type: result.contentType,
        image_size_bytes: result.sizeBytes,
        image_url: result.url,
      })
      .returning('*');

    return updated;
  }
  static async getImageUrl(recordId, user) {
    const record = await db('medical_records').where({ id: recordId }).first();
    if (!record) {
      throw new AppError(ErrorCodes.RECORD_NOT_FOUND, 'Record not found');
    }
    await ProviderPatientService.verifyAccess(user, record.patient_id);

    if (!record.image_storage_key) {
      throw new AppError(ErrorCodes.RECORD_NOT_FOUND, 'No image attached to this record');
    }

    const signedUrl = await ImageStorageService.getSignedUrl(record.image_storage_key);
    return { url: signedUrl, contentType: record.image_content_type };
  }
}
module.exports = RecordService;
