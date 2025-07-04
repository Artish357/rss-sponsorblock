import { db } from '../general/db.js';
import type { Feed, FeedData } from '../general/types.js';

export const getFeed = async (feedHash: string): Promise<Feed | null> => {
  const result = await db('feeds')
    .where({ feed_hash: feedHash })
    .first();
  
  return result || null;
};

export const createOrUpdateFeed = async (feedHash: string, data: FeedData): Promise<Feed> => {
  const existing = await getFeed(feedHash);
  
  if (existing) {
    // Update existing feed
    await db('feeds')
      .where({ feed_hash: feedHash })
      .update({
        ...data,
        updated_at: db.fn.now()
      });
  } else {
    // Create new feed
    await db('feeds')
      .insert({
        feed_hash: feedHash,
        ...data,
        created_at: db.fn.now(),
        updated_at: db.fn.now()
      });
  }
  
  const result = await getFeed(feedHash);
  if (!result) {
    throw new Error(`Failed to create/update feed: ${feedHash}`);
  }
  
  return result;
};