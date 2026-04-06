const db = require('../models/db');
const StorageService = require('./storageService');
const { logger } = require('../utils/logger');

const ALLOWED_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/dicom',
  'application/dicom',
  'image/tiff',
  'application/pdf'
];

const MAX_FILE_SIZE = parseInt(process.env.MAX_IMAGE_SIZE_BYTES || '52428800', 10); // 50MB default

class ImageAttachmentService {
  /**
   * Upload an image attachment for a medical record.
   * Stores the file in S3 and saves only the reference in the database.
   * @param {object} params - { recordId, patientId, fileBuffer, contentType, originalName, userId }
   * @returns {Promise<object>} The created image attachment record.
   */
  static async upload({ recordId, patientId, fileBuffer, contentType, originalName, userId }) {
    if (!ALLOWED_CONTENT_TYPES.includes(contentType)) {
      const err = new Error(`Unsupported content type: ${contentType}. Allowed: ${ALLOWED_CONTENT_TYPES.join(', ')}`);
      err.status = 400;
      throw err;
    }

    if (fileBuffer.length > MAX_FILE_SIZE) {
      const err = new Error(`File size ${fileBuffer.length} exceeds maximum allowed size of ${MAX_FILE_SIZE} bytes`);
      err.status = 400;
      throw err;
    }

    const record = await db('medical_records').where({ id: recordId }).first();
    if (!record) {
      const err = new Error(`Medical record ${recordId} not found`);
      err.status = 404;
      throw err;
    }

    const { key, bucket, versionId } = await StorageService.upload(fileBuffer, {
      contentType,
      patientId,
      recordId,
      originalName
    });

    const storageUrl = `s3://${bucket}/${key}`;

    const [attachment] = await db('image_attachments').insert({
      record_id: recordId,
      patient_id: patientId,
      storage_key: key,
      storage_bucket: bucket,
      storage_url: storageUrl,
      content_type: contentType,
      file_size: fileBuffer.length,
      original_name: originalName,
      version_id: versionId || null,
      uploaded_by: userId,
      created_at: db.fn.now()
    }).returning('*');

    logger.info({
      type: 'HIPAA_AUDIT',
      action: 'IMAGE_ATTACHMENT_CREATED',
      attachmentId: attachment.id,
      recordId,
      patientId,
      storageUrl,
      userId
    });

    return attachment;
  }

  /**
   * Get a presigned download URL for an image attachment.
   * @param {string} attachmentId - The attachment ID.
   * @param {object} user - The requesting user.
   * @returns {Promise<{ url: string, contentType: string, originalName: string }>}
   */
  static async getDownloadUrl(attachmentId, user) {
    const attachment = await db('image_attachments').where({ id: attachmentId }).first();
    if (!attachment) {
      const err = new Error(`Attachment ${attachmentId} not found`);
      err.status = 404;
      throw err;
    }

    const url = await StorageService.getPresignedUrl(attachment.storage_key);

    logger.info({
      type: 'HIPAA_AUDIT',
      action: 'IMAGE_DOWNLOAD_URL_GENERATED',
      attachmentId,
      recordId: attachment.record_id,
      patientId: attachment.patient_id,
      userId: user.id
    });

    return {
      url,
      contentType: attachment.content_type,
      originalName: attachment.original_name
    };
  }

  /**
   * List all image attachments for a medical record.
   * @param {string} recordId - The medical record ID.
   * @returns {Promise<Array>}
   */
  static async listByRecord(recordId) {
    return db('image_attachments')
      .where({ record_id: recordId })
      .select('id', 'record_id', 'patient_id', 'storage_url', 'content_type', 'file_size', 'original_name', 'created_at')
      .orderBy('created_at', 'desc');
  }

  /**
   * Delete an image attachment (from S3 and the database).
   * @param {string} attachmentId - The attachment ID.
   * @param {object} user - The requesting user.
   * @returns {Promise<void>}
   */
  static async delete(attachmentId, user) {
    const attachment = await db('image_attachments').where({ id: attachmentId }).first();
    if (!attachment) {
      const err = new Error(`Attachment ${attachmentId} not found`);
      err.status = 404;
      throw err;
    }

    await StorageService.delete(attachment.storage_key);
    await db('image_attachments').where({ id: attachmentId }).del();

    logger.info({
      type: 'HIPAA_AUDIT',
      action: 'IMAGE_ATTACHMENT_DELETED',
      attachmentId,
      recordId: attachment.record_id,
      patientId: attachment.patient_id,
      userId: user.id
    });
  }
}

module.exports = ImageAttachmentService;
