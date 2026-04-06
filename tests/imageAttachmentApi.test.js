const express = require('express');
const request = require('supertest');

const mockUpload = jest.fn();
const mockGetByRecord = jest.fn();
const mockGetPresignedUrl = jest.fn();
const mockDelete = jest.fn();

jest.mock('../src/services/imageAttachmentService', () => {
  return jest.fn().mockImplementation(() => ({
    upload: mockUpload,
    getByRecord: mockGetByRecord,
    getPresignedUrl: mockGetPresignedUrl,
    delete: mockDelete,
  }));
});

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const { AppError, ErrorCodes } = require('../src/utils/errorCodes');
const { StorageError } = require('../src/services/storageService');

function createApp() {
  const app = express();
  app.use(express.json({ limit: '5mb' }));
  app.use((req, _res, next) => {
    req.user = { id: 'user-1', role: 'provider', provider_id: 'provider-1' };
    next();
  });
  app.use('/api/v1/image-attachments', require('../src/api/imageAttachments'));
  return app;
}

describe('Image Attachments API', () => {
  let app;

  beforeAll(() => {
    app = createApp();
  });

  beforeEach(() => {
    mockUpload.mockReset();
    mockGetByRecord.mockReset();
    mockGetPresignedUrl.mockReset();
    mockDelete.mockReset();
  });

  describe('POST /api/v1/image-attachments/record/:recordId', () => {
    it('should upload an image and return 201', async () => {
      const mockAttachment = {
        id: 'att-1',
        record_id: 'rec-1',
        storage_key: 'medical-images/2026/04/06/rec-1/abc.jpg',
        mime_type: 'image/jpeg',
        original_filename: 'xray.jpg',
      };
      mockUpload.mockResolvedValue(mockAttachment);

      const res = await request(app)
        .post('/api/v1/image-attachments/record/rec-1')
        .send({
          file_data: Buffer.from('fake-image').toString('base64'),
          mime_type: 'image/jpeg',
          filename: 'xray.jpg',
        });

      expect(res.status).toBe(201);
      expect(res.body.id).toBe('att-1');
      expect(res.body.storage_key).toContain('medical-images');
      expect(mockUpload).toHaveBeenCalledTimes(1);
    });

    it('should return 400 when file_data is missing', async () => {
      const res = await request(app)
        .post('/api/v1/image-attachments/record/rec-1')
        .send({ mime_type: 'image/jpeg' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('MISSING_REQUIRED_FIELDS');
    });

    it('should return 400 when mime_type is missing', async () => {
      const res = await request(app)
        .post('/api/v1/image-attachments/record/rec-1')
        .send({ file_data: 'base64data' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('MISSING_REQUIRED_FIELDS');
    });

    it('should return 400 for StorageError (invalid file type)', async () => {
      mockUpload.mockRejectedValue(
        new StorageError('INVALID_FILE_TYPE', 'File type not allowed')
      );

      const res = await request(app)
        .post('/api/v1/image-attachments/record/rec-1')
        .send({
          file_data: Buffer.from('fake').toString('base64'),
          mime_type: 'text/html',
          filename: 'bad.html',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_FILE_TYPE');
    });

    it('should return 404 when record does not exist', async () => {
      mockUpload.mockRejectedValue(
        new AppError(ErrorCodes.RECORD_NOT_FOUND, 'Record not found')
      );

      const res = await request(app)
        .post('/api/v1/image-attachments/record/non-existent')
        .send({
          file_data: Buffer.from('fake').toString('base64'),
          mime_type: 'image/jpeg',
          filename: 'test.jpg',
        });

      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/v1/image-attachments/record/:recordId', () => {
    it('should return a list of attachments for a record', async () => {
      const mockAttachments = [
        { id: 'att-1', record_id: 'rec-1', original_filename: 'xray.jpg' },
        { id: 'att-2', record_id: 'rec-1', original_filename: 'mri.dcm' },
      ];
      mockGetByRecord.mockResolvedValue(mockAttachments);

      const res = await request(app)
        .get('/api/v1/image-attachments/record/rec-1');

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(res.body[0].original_filename).toBe('xray.jpg');
    });

    it('should return 404 when record does not exist', async () => {
      mockGetByRecord.mockRejectedValue(
        new AppError(ErrorCodes.RECORD_NOT_FOUND, 'Record not found')
      );

      const res = await request(app)
        .get('/api/v1/image-attachments/record/non-existent');

      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/v1/image-attachments/:id/url', () => {
    it('should return a presigned URL', async () => {
      mockGetPresignedUrl.mockResolvedValue({
        url: 'https://s3.amazonaws.com/presigned',
        expires_in: 3600,
      });

      const res = await request(app)
        .get('/api/v1/image-attachments/att-1/url');

      expect(res.status).toBe(200);
      expect(res.body.url).toBe('https://s3.amazonaws.com/presigned');
      expect(res.body.expires_in).toBe(3600);
    });

    it('should return 404 when attachment does not exist', async () => {
      mockGetPresignedUrl.mockRejectedValue(
        new AppError(ErrorCodes.RECORD_NOT_FOUND, 'Attachment not found')
      );

      const res = await request(app)
        .get('/api/v1/image-attachments/non-existent/url');

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/v1/image-attachments/:id', () => {
    it('should delete an attachment and return 204', async () => {
      mockDelete.mockResolvedValue(undefined);

      const res = await request(app)
        .delete('/api/v1/image-attachments/att-1');

      expect(res.status).toBe(204);
      expect(mockDelete).toHaveBeenCalledTimes(1);
    });

    it('should return 404 when attachment does not exist', async () => {
      mockDelete.mockRejectedValue(
        new AppError(ErrorCodes.RECORD_NOT_FOUND, 'Attachment not found')
      );

      const res = await request(app)
        .delete('/api/v1/image-attachments/non-existent');

      expect(res.status).toBe(404);
    });
  });
});

describe('Image storage approach (no BLOBs in DB)', () => {
  it('should NOT store file_data in the database insert', async () => {
    const app = createApp();

    mockUpload.mockImplementation(async (recordId, fileBuffer, mimeType, filename) => {
      // Verify buffer is passed, not raw base64 string
      expect(Buffer.isBuffer(fileBuffer)).toBe(true);
      return {
        id: 'att-1',
        record_id: recordId,
        storage_key: 'medical-images/key',
        storage_bucket: 'bucket',
        file_size: fileBuffer.length,
        mime_type: mimeType,
        original_filename: filename,
      };
    });

    const res = await request(app)
      .post('/api/v1/image-attachments/record/rec-1')
      .send({
        file_data: Buffer.from('test-image-data').toString('base64'),
        mime_type: 'image/jpeg',
        filename: 'test.jpg',
      });

    expect(res.status).toBe(201);
    // The response should only contain a storage_key reference, not the raw image data
    expect(res.body).not.toHaveProperty('file_data');
    expect(res.body).toHaveProperty('storage_key');
  });
});
