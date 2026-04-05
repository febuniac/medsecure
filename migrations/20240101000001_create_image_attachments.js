/**
 * Migration: Create image_attachments table
 *
 * Replaces storing medical image BLOBs directly in medical_records
 * with S3 object storage references in a dedicated table.
 */
exports.up = function (knex) {
  return knex.schema.createTable('image_attachments', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('record_id').notNullable().references('id').inTable('medical_records').onDelete('CASCADE');
    table.uuid('patient_id').notNullable().index();
    table.string('storage_key', 512).notNullable();
    table.string('storage_bucket', 255).notNullable();
    table.string('storage_url', 1024).notNullable();
    table.string('content_type', 128).notNullable();
    table.bigInteger('file_size').notNullable();
    table.string('original_name', 255);
    table.string('version_id', 255);
    table.uuid('uploaded_by').notNullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.index(['record_id'], 'idx_image_attachments_record_id');
    table.index(['patient_id'], 'idx_image_attachments_patient_id');
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('image_attachments');
};
