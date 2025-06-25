export async function up(knex) {
  await knex.schema.createTable('episodes', (table) => {
    table.text('feed_hash').notNullable();
    table.text('episode_guid').notNullable();
    table.text('original_url');
    table.text('file_path');
    table.text('ad_segments'); // JSON
    table.text('status').defaultTo('pending');
    table.timestamp('processed_at').defaultTo(knex.fn.now());

    // Composite primary key
    table.primary(['feed_hash', 'episode_guid']);

    // Add indexes for performance
    table.index('feed_hash');
    table.index('status');
    table.index('processed_at');
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('episodes');
}
