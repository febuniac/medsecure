/**
 * Migration: Create image_attachments table
 *
 * Replaces storing image BLOBs directly in medical_records with S3 references.
 * Images are now stored in S3/object storage; only metadata is kept in the DB.
 */

exports.up = function (knex) {
  return knex.schema
    .createTable('image_attachments', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table
        .uuid('record_id')
        .notNullable()
        .references('id')
        .inTable('medical_records')
        .onDelete('CASCADE');
      table.string('storage_key', 512).notNullable();
      table.string('storage_bucket', 255).notNullable();
      table.integer('file_size').notNullable();
      table.string('mime_type', 100).notNullable();
      table.string('original_filename', 255).notNullable();
      table.uuid('uploaded_by').notNullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());

      table.index('record_id', 'idx_image_attachments_record_id');
      table.index('uploaded_by', 'idx_image_attachments_uploaded_by');
    })
    .then(() => {
      // Remove the image_data BLOB column from medical_records if it exists
      return knex.schema.hasColumn('medical_records', 'image_data').then((exists) => {
        if (exists) {
          return knex.schema.alterTable('medical_records', (table) => {
            table.dropColumn('image_data');
          });
        }
      });
    });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('image_attachments');
};
