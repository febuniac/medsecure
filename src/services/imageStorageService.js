const crypto = require('crypto');
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { logger } = require('../utils/logger');

const BUCKET_NAME = process.env.S3_BUCKET_NAME || 'medsecure-medical-images';
const REGION = process.env.AWS_REGION || 'us-east-1';
const SIGNED_URL_EXPIRY = parseInt(process.env.S3_SIGNED_URL_EXPIRY_SECONDS, 10) || 3600;
const MAX_IMAGE_SIZE = parseInt(process.env.MAX_IMAGE_SIZE_BYTES, 10) || 20 * 1024 * 1024; // 20MB

const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/dicom',
  'image/tiff',
  'application/dicom',
  'application/pdf',
];

function createS3Client() {
  const config = { region: REGION };
  if (process.env.S3_ENDPOINT) {
    config.endpoint = process.env.S3_ENDPOINT;
    config.forcePathStyle = true;
  }
  return new S3Client(config);
}

let s3Client = null;

function getS3Client() {
  if (!s3Client) {
    s3Client = createS3Client();
  }
  return s3Client;
}

function resetS3Client() {
  s3Client = null;
}

function generateObjectKey(patientId, fileName) {
  const timestamp = Date.now();
  const uniqueId = crypto.randomUUID();
  const sanitizedName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `patients/${patientId}/images/${timestamp}-${uniqueId}-${sanitizedName}`;
}

function validateImage(buffer, contentType) {
  if (!buffer || buffer.length === 0) {
    return { valid: false, error: 'Image data is empty' };
  }
  if (buffer.length > MAX_IMAGE_SIZE) {
    return { valid: false, error: `Image exceeds maximum size of ${MAX_IMAGE_SIZE} bytes` };
  }
  if (!ALLOWED_MIME_TYPES.includes(contentType)) {
    return { valid: false, error: `Content type '${contentType}' is not allowed. Allowed types: ${ALLOWED_MIME_TYPES.join(', ')}` };
  }
  return { valid: true };
}

class ImageStorageService {
  static async upload(patientId, imageBuffer, fileName, contentType) {
    const validation = validateImage(imageBuffer, contentType);
    if (!validation.valid) {
      const err = new Error(validation.error);
      err.status = 400;
      err.code = 'VALIDATION_FAILED';
      throw err;
    }

    const objectKey = generateObjectKey(patientId, fileName);

    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: objectKey,
      Body: imageBuffer,
      ContentType: contentType,
      ServerSideEncryption: 'aws:kms',
      Metadata: {
        'patient-id': patientId,
        'original-filename': fileName,
        'upload-timestamp': new Date().toISOString(),
      },
    });

    await getS3Client().send(command);

    logger.info({
      type: 'IMAGE_UPLOAD',
      action: 'stored_in_s3',
      patientId,
      objectKey,
      contentType,
      sizeBytes: imageBuffer.length,
    });

    return {
      storageKey: objectKey,
      bucket: BUCKET_NAME,
      contentType,
      sizeBytes: imageBuffer.length,
      url: `s3://${BUCKET_NAME}/${objectKey}`,
    };
  }

  static async getSignedUrl(objectKey) {
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: objectKey,
    });

    const url = await getSignedUrl(getS3Client(), command, { expiresIn: SIGNED_URL_EXPIRY });

    logger.info({
      type: 'IMAGE_ACCESS',
      action: 'signed_url_generated',
      objectKey,
      expiresInSeconds: SIGNED_URL_EXPIRY,
    });

    return url;
  }

  static async delete(objectKey) {
    const command = new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: objectKey,
    });

    await getS3Client().send(command);

    logger.info({
      type: 'IMAGE_DELETE',
      action: 'deleted_from_s3',
      objectKey,
    });
  }
}

module.exports = {
  ImageStorageService,
  validateImage,
  generateObjectKey,
  resetS3Client,
  ALLOWED_MIME_TYPES,
  MAX_IMAGE_SIZE,
};
