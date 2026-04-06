const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const crypto = require('crypto');
const { logger } = require('../utils/logger');

const BUCKET = process.env.S3_BUCKET || 'medsecure-medical-images';
const REGION = process.env.AWS_REGION || 'us-east-1';
const PRESIGNED_URL_EXPIRY = parseInt(process.env.PRESIGNED_URL_EXPIRY_SECONDS || '3600', 10);

const s3Client = new S3Client({
  region: REGION,
  ...(process.env.S3_ENDPOINT && { endpoint: process.env.S3_ENDPOINT, forcePathStyle: true })
});

class StorageService {
  /**
   * Upload a file to S3 with server-side encryption.
   * @param {Buffer} fileBuffer - The file content as a Buffer.
   * @param {object} metadata - { contentType, patientId, recordId, originalName }
   * @returns {Promise<{ key: string, bucket: string, versionId?: string }>}
   */
  static async upload(fileBuffer, metadata) {
    const { contentType, patientId, recordId, originalName } = metadata;
    const timestamp = Date.now();
    const hash = crypto.createHash('sha256').update(fileBuffer).digest('hex').slice(0, 12);
    const ext = originalName ? '.' + originalName.split('.').pop() : '';
    const key = `patients/${patientId}/records/${recordId}/${timestamp}-${hash}${ext}`;

    const command = new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: fileBuffer,
      ContentType: contentType || 'application/octet-stream',
      ServerSideEncryption: 'aws:kms',
      Metadata: {
        'patient-id': String(patientId),
        'record-id': String(recordId),
        'original-name': originalName || 'unknown',
        'upload-timestamp': String(timestamp)
      }
    });

    const result = await s3Client.send(command);

    logger.info({
      type: 'HIPAA_AUDIT',
      action: 'IMAGE_UPLOAD',
      patientId,
      recordId,
      key,
      bucket: BUCKET,
      contentType,
      sizeBytes: fileBuffer.length
    });

    return {
      key,
      bucket: BUCKET,
      versionId: result.VersionId
    };
  }

  /**
   * Generate a time-limited presigned URL for downloading an image.
   * @param {string} key - The S3 object key.
   * @returns {Promise<string>} Presigned download URL.
   */
  static async getPresignedUrl(key) {
    const command = new GetObjectCommand({
      Bucket: BUCKET,
      Key: key
    });

    return getSignedUrl(s3Client, command, { expiresIn: PRESIGNED_URL_EXPIRY });
  }

  /**
   * Delete a file from S3.
   * @param {string} key - The S3 object key.
   * @returns {Promise<void>}
   */
  static async delete(key) {
    const command = new DeleteObjectCommand({
      Bucket: BUCKET,
      Key: key
    });

    await s3Client.send(command);

    logger.info({
      type: 'HIPAA_AUDIT',
      action: 'IMAGE_DELETE',
      key,
      bucket: BUCKET
    });
  }

  /**
   * Download a file from S3.
   * @param {string} key - The S3 object key.
   * @returns {Promise<{ body: ReadableStream, contentType: string }>}
   */
  static async download(key) {
    const command = new GetObjectCommand({
      Bucket: BUCKET,
      Key: key
    });

    const response = await s3Client.send(command);

    logger.info({
      type: 'HIPAA_AUDIT',
      action: 'IMAGE_DOWNLOAD',
      key,
      bucket: BUCKET
    });

    return {
      body: response.Body,
      contentType: response.ContentType
    };
  }
}

module.exports = StorageService;
