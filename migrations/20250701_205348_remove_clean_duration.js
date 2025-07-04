export async function up(knex) {
  await knex.schema.alterTable('episodes', (table) => {
    table.dropColumn('clean_duration');
    table.dropColumn('clean_duration_source');
  });
}

export async function down(knex) {
  await knex.schema.alterTable('episodes', (table) => {
    table.decimal('clean_duration', 10, 2);
    table.text('clean_duration_source');
  });
}