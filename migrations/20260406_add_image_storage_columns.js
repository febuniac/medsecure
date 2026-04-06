exports.up = function(knex) {
  return knex.schema.alterTable('medical_records', (table) => {
    table.text('image_storage_key').nullable();
    table.text('image_bucket').nullable();
    table.text('image_content_type').nullable();
    table.integer('image_size_bytes').nullable();
    table.text('image_url').nullable();
    table.dropColumn('image_data');
  });
};

exports.down = function(knex) {
  return knex.schema.alterTable('medical_records', (table) => {
    table.binary('image_data').nullable();
    table.dropColumn('image_storage_key');
    table.dropColumn('image_bucket');
    table.dropColumn('image_content_type');
    table.dropColumn('image_size_bytes');
    table.dropColumn('image_url');
  });
};
