const express = require('express');
const imageAttachmentsRouter = require('../src/api/imageAttachments');
const ImageAttachmentService = require('../src/services/imageAttachmentService');

jest.mock('../src/services/imageAttachmentService', () => ({
  upload: jest.fn(),
  getDownloadUrl: jest.fn(),
  listByRecord: jest.fn(),
  delete: jest.fn(),
}));

// Simple test helper to make requests without supertest
function createTestApp() {
  const app = express();
  app.use(express.json({ limit: '50mb' }));
  app.use((req, _res, next) => {
    req.user = { id: 'user-1', provider_id: 'provider-1' };
    next();
  });
  app.use('/api/v1/image-attachments', imageAttachmentsRouter);
  return app;
}

describe('Image Attachments API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/v1/image-attachments', () => {
    it('should validate required fields and return 400 for missing fields', async () => {
      const app = createTestApp();
      const server = app.listen(0);
      const port = server.address().port;

      try {
        const response = await fetch(`http://localhost:${port}/api/v1/image-attachments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ record_id: 'r1' }), // missing required fields
        });

        expect(response.status).toBe(400);
        const body = await response.json();
        expect(body.error).toContain('Missing required fields');
      } finally {
        server.close();
      }
    });

    it('should call ImageAttachmentService.upload with correct params and return 201', async () => {
      const mockAttachment = {
        id: 'att-1',
        record_id: 'r1',
        patient_id: 'p1',
        storage_url: 's3://bucket/key',
        content_type: 'image/jpeg',
        file_size: 100,
        original_name: 'xray.jpg',
        created_at: '2026-01-01T00:00:00Z',
      };

      ImageAttachmentService.upload.mockResolvedValue(mockAttachment);

      const app = createTestApp();
      const server = app.listen(0);
      const port = server.address().port;

      try {
        const response = await fetch(`http://localhost:${port}/api/v1/image-attachments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            record_id: 'r1',
            patient_id: 'p1',
            file_data: Buffer.from('test').toString('base64'),
            content_type: 'image/jpeg',
            original_name: 'xray.jpg',
          }),
        });

        expect(response.status).toBe(201);
        const body = await response.json();
        expect(body.id).toBe('att-1');
        expect(body.storage_url).toContain('s3://');
        expect(body).not.toHaveProperty('file_data');

        expect(ImageAttachmentService.upload).toHaveBeenCalledWith(
          expect.objectContaining({
            recordId: 'r1',
            patientId: 'p1',
            contentType: 'image/jpeg',
          })
        );
      } finally {
        server.close();
      }
    });
  });

  describe('GET /api/v1/image-attachments/record/:recordId', () => {
    it('should return list of attachments for a record', async () => {
      const mockAttachments = [
        { id: 'att-1', storage_url: 's3://bucket/key1' },
        { id: 'att-2', storage_url: 's3://bucket/key2' },
      ];

      ImageAttachmentService.listByRecord.mockResolvedValue(mockAttachments);

      const app = createTestApp();
      const server = app.listen(0);
      const port = server.address().port;

      try {
        const response = await fetch(`http://localhost:${port}/api/v1/image-attachments/record/r1`);

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body).toHaveLength(2);
        expect(ImageAttachmentService.listByRecord).toHaveBeenCalledWith('r1');
      } finally {
        server.close();
      }
    });
  });

  describe('GET /api/v1/image-attachments/:id/download', () => {
    it('should return presigned download URL', async () => {
      ImageAttachmentService.getDownloadUrl.mockResolvedValue({
        url: 'https://presigned.url/path',
        contentType: 'image/jpeg',
        originalName: 'xray.jpg',
      });

      const app = createTestApp();
      const server = app.listen(0);
      const port = server.address().port;

      try {
        const response = await fetch(`http://localhost:${port}/api/v1/image-attachments/att-1/download`);

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.url).toBe('https://presigned.url/path');
        expect(body.contentType).toBe('image/jpeg');
      } finally {
        server.close();
      }
    });
  });

  describe('DELETE /api/v1/image-attachments/:id', () => {
    it('should delete attachment and return 204', async () => {
      ImageAttachmentService.delete.mockResolvedValue(undefined);

      const app = createTestApp();
      const server = app.listen(0);
      const port = server.address().port;

      try {
        const response = await fetch(`http://localhost:${port}/api/v1/image-attachments/att-1`, {
          method: 'DELETE',
        });

        expect(response.status).toBe(204);
        expect(ImageAttachmentService.delete).toHaveBeenCalledWith('att-1', { id: 'user-1', provider_id: 'provider-1' });
      } finally {
        server.close();
      }
    });
  });
});
