exports.up = function(knex) {
  return knex.schema.createTable('drug_interactions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('drug_a').notNullable().index();
    table.string('drug_b').notNullable().index();
    table.string('severity').notNullable().defaultTo('major');
    table.text('description').nullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.unique(['drug_a', 'drug_b']);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('drug_interactions');
};
