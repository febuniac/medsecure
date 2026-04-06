const db = require('../models/db');
const ProviderPatientService = require('./providerPatientService');
const { AppError, ErrorCodes } = require('../utils/errorCodes');
const ImageAttachmentService = require('./imageAttachmentService');
const { logger } = require('../utils/logger');

// Fields that contain BLOB/binary image data and should not be stored in the database
const IMAGE_BLOB_FIELDS = ['image_data', 'attachment_data', 'file_data', 'image', 'dicom_data'];

class RecordService {
  static async getByPatient(patientId, user, { page = 1, limit = 20 } = {}) {
    await ProviderPatientService.verifyAccess(user, patientId);

    const offset = (page - 1) * limit;

    const [records, [{ count: totalCount }]] = await Promise.all([
      db('medical_records')
        .where({ patient_id: patientId })
        .orderBy('date', 'desc')
        .limit(limit)
        .offset(offset),
      db('medical_records')
        .where({ patient_id: patientId })
        .count('* as count'),
    ]);

    const total = parseInt(totalCount, 10);
    const data = await Promise.all(records.map(record => RecordService._attachImageReferences(record)));

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  static async getById(id, user) {
    const record = await db('medical_records').where({ id }).first();
    if (!record) {
      throw new AppError(ErrorCodes.RECORD_NOT_FOUND, 'Record not found');
    }
    await ProviderPatientService.verifyAccess(user, record.patient_id);
    return RecordService._attachImageReferences(record);
  }

  static async create(data, user) {
    await ProviderPatientService.verifyAccess(user, data.patient_id);
    const imageFields = RecordService._extractImageFields(data);
    data.created_by = user.id;

    const [record] = await db('medical_records').insert(data).returning('*');

    // If image data was included in the request, upload to S3 instead
    if (imageFields.length > 0) {
      for (const { fieldName, buffer, contentType, originalName } of imageFields) {
        await ImageAttachmentService.upload({
          recordId: record.id,
          patientId: data.patient_id,
          fileBuffer: buffer,
          contentType: contentType || 'application/octet-stream',
          originalName: originalName || fieldName,
          userId: user.id
        });
      }

      logger.info({
        type: 'HIPAA_AUDIT',
        action: 'IMAGE_BLOB_MIGRATED_TO_S3',
        recordId: record.id,
        patientId: data.patient_id,
        fieldsProcessed: imageFields.map(f => f.fieldName)
      });
    }

    return RecordService._attachImageReferences(record);
  }

  /**
   * Extract and remove image BLOB fields from the data object.
   * Returns an array of extracted image info and mutates the original data
   * to remove the BLOB fields (so they are not stored in the DB).
   */
  static _extractImageFields(data) {
    const extracted = [];

    for (const field of IMAGE_BLOB_FIELDS) {
      if (data[field]) {
        const value = data[field];
        let buffer;
        let contentType = data[`${field}_content_type`] || data.content_type;
        const originalName = data[`${field}_name`] || data.original_name;

        if (Buffer.isBuffer(value)) {
          buffer = value;
        } else if (typeof value === 'string') {
          // Assume base64-encoded string
          buffer = Buffer.from(value, 'base64');
        } else {
          continue;
        }

        extracted.push({ fieldName: field, buffer, contentType, originalName });

        // Remove BLOB fields from the data so they don't go into the DB
        delete data[field];
        delete data[`${field}_content_type`];
        delete data[`${field}_name`];
      }
    }

    return extracted;
  }

  /**
   * Attach image attachment references to a medical record.
   */
  static async _attachImageReferences(record) {
    const attachments = await db('image_attachments')
      .where({ record_id: record.id })
      .select('id', 'storage_url', 'content_type', 'file_size', 'original_name', 'created_at');

    record.image_attachments = attachments;
    return record;
  }
}

module.exports = RecordService;
