const db = require('../models/db');
const { StorageService } = require('./storageService');
const ProviderPatientService = require('./providerPatientService');
const { AppError, ErrorCodes } = require('../utils/errorCodes');
const { logger } = require('../utils/logger');

class ImageAttachmentService {
  constructor(storageService) {
    this.storage = storageService || new StorageService();
  }

  async upload(recordId, fileBuffer, mimeType, filename, user) {
    const record = await db('medical_records').where({ id: recordId }).first();
    if (!record) {
      throw new AppError(ErrorCodes.RECORD_NOT_FOUND, 'Record not found');
    }

    await ProviderPatientService.verifyAccess(user, record.patient_id);

    const storageResult = await this.storage.upload(fileBuffer, mimeType, recordId, filename);

    const [attachment] = await db('image_attachments')
      .insert({
        record_id: recordId,
        storage_key: storageResult.storage_key,
        storage_bucket: storageResult.storage_bucket,
        file_size: storageResult.file_size,
        mime_type: storageResult.mime_type,
        original_filename: storageResult.original_filename,
        uploaded_by: user.id,
      })
      .returning('*');

    logger.info({
      type: 'HIPAA_AUDIT',
      action: 'IMAGE_UPLOADED',
      recordId,
      attachmentId: attachment.id,
      userId: user.id,
      filename: storageResult.original_filename,
    });

    return attachment;
  }

  async getByRecord(recordId, user) {
    const record = await db('medical_records').where({ id: recordId }).first();
    if (!record) {
      throw new AppError(ErrorCodes.RECORD_NOT_FOUND, 'Record not found');
    }

    await ProviderPatientService.verifyAccess(user, record.patient_id);

    const attachments = await db('image_attachments')
      .where({ record_id: recordId })
      .orderBy('created_at', 'desc');

    return attachments;
  }

  async getPresignedUrl(attachmentId, user) {
    const attachment = await db('image_attachments').where({ id: attachmentId }).first();
    if (!attachment) {
      throw new AppError(ErrorCodes.RECORD_NOT_FOUND, 'Attachment not found');
    }

    const record = await db('medical_records').where({ id: attachment.record_id }).first();
    if (!record) {
      throw new AppError(ErrorCodes.RECORD_NOT_FOUND, 'Record not found');
    }

    await ProviderPatientService.verifyAccess(user, record.patient_id);

    const url = await this.storage.getPresignedUrl(attachment.storage_key);

    logger.info({
      type: 'HIPAA_AUDIT',
      action: 'IMAGE_ACCESSED',
      attachmentId,
      recordId: attachment.record_id,
      userId: user.id,
    });

    return { url, expires_in: 3600 };
  }

  async delete(attachmentId, user) {
    const attachment = await db('image_attachments').where({ id: attachmentId }).first();
    if (!attachment) {
      throw new AppError(ErrorCodes.RECORD_NOT_FOUND, 'Attachment not found');
    }

    const record = await db('medical_records').where({ id: attachment.record_id }).first();
    if (!record) {
      throw new AppError(ErrorCodes.RECORD_NOT_FOUND, 'Record not found');
    }

    await ProviderPatientService.verifyAccess(user, record.patient_id);

    await this.storage.delete(attachment.storage_key);

    await db('image_attachments').where({ id: attachmentId }).del();

    logger.info({
      type: 'HIPAA_AUDIT',
      action: 'IMAGE_DELETED',
      attachmentId,
      recordId: attachment.record_id,
      userId: user.id,
    });
  }
}

module.exports = ImageAttachmentService;
