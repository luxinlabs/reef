import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
export const campaigns = sqliteTable('campaigns', {
  id: text('id').primaryKey(), owner: text('owner').notNull(), data: text('data').notNull(),
  revision: integer('revision').notNull().default(1), updatedAt: text('updated_at').notNull(),
});
export const uploads = sqliteTable('uploads', {
  id: text('id').primaryKey(), owner: text('owner').notNull(), name: text('name').notNull(),
  mime: text('mime').notNull(), size: integer('size').notNull(), createdAt: text('created_at').notNull(),
});
