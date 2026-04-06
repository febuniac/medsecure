const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const crypto = require('crypto');
const path = require('path');
const { logger } = require('../utils/logger');

const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/dicom',
  'image/tiff',
  'application/dicom',
  'application/pdf',
];

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

const PRESIGNED_URL_EXPIRY = 3600; // 1 hour

function createS3Client() {
  return new S3Client({
    region: process.env.AWS_REGION || 'us-east-1',
    ...(process.env.S3_ENDPOINT && { endpoint: process.env.S3_ENDPOINT }),
    ...(process.env.S3_FORCE_PATH_STYLE === 'true' && { forcePathStyle: true }),
  });
}

function getBucket() {
  return process.env.S3_BUCKET_NAME || 'medsecure-medical-images';
}

function generateObjectKey(recordId, originalFilename) {
  const ext = originalFilename ? path.extname(originalFilename) : '.bin';
  const uniqueId = crypto.randomUUID();
  const datePrefix = new Date().toISOString().slice(0, 10).replace(/-/g, '/');
  return `medical-images/${datePrefix}/${recordId}/${uniqueId}${ext}`;
}

class StorageService {
  constructor(s3Client) {
    this.s3 = s3Client || createS3Client();
    this.bucket = getBucket();
  }

  validateFile(fileBuffer, mimeType, _filename) {
    if (!fileBuffer || fileBuffer.length === 0) {
      throw new StorageError('EMPTY_FILE', 'File is empty');
    }
    if (fileBuffer.length > MAX_FILE_SIZE) {
      throw new StorageError(
        'FILE_TOO_LARGE',
        `File exceeds maximum size of ${MAX_FILE_SIZE / (1024 * 1024)} MB`
      );
    }
    if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
      throw new StorageError(
        'INVALID_FILE_TYPE',
        `File type '${mimeType}' is not allowed. Accepted types: ${ALLOWED_MIME_TYPES.join(', ')}`
      );
    }
    return true;
  }

  async upload(fileBuffer, mimeType, recordId, filename) {
    this.validateFile(fileBuffer, mimeType, filename);

    const key = generateObjectKey(recordId, filename);

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: fileBuffer,
      ContentType: mimeType,
      ServerSideEncryption: 'aws:kms',
      Metadata: {
        'record-id': String(recordId),
        'original-filename': filename || 'unknown',
        'upload-timestamp': new Date().toISOString(),
      },
    });

    await this.s3.send(command);

    logger.info({
      type: 'IMAGE_UPLOAD',
      action: 'uploaded',
      recordId,
      key,
      size: fileBuffer.length,
      mimeType,
    });

    return {
      storage_key: key,
      storage_bucket: this.bucket,
      file_size: fileBuffer.length,
      mime_type: mimeType,
      original_filename: filename || 'unknown',
    };
  }

  async getPresignedUrl(key) {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    return getSignedUrl(this.s3, command, { expiresIn: PRESIGNED_URL_EXPIRY });
  }

  async delete(key) {
    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    await this.s3.send(command);

    logger.info({
      type: 'IMAGE_DELETE',
      action: 'deleted',
      key,
    });
  }
}

class StorageError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'StorageError';
    this.code = code;
    this.status = 400;
  }
}

module.exports = {
  StorageService,
  StorageError,
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE,
  createS3Client,
  generateObjectKey,
};
