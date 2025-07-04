export async function up(knex) {
  await knex.schema.createTable('feeds', (table) => {
    table.text('feed_hash').primary();
    table.text('feed_url').notNullable();
    table.text('title');
    table.text('description');
    table.text('raw_xml');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('feeds');
}