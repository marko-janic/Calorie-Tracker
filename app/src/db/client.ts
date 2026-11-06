import { drizzle, ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite';
import { openDatabaseAsync } from 'expo-sqlite';

import * as schema from './schema';

export type Database = ExpoSQLiteDatabase<typeof schema>;

let opening: Promise<Database> | null = null;

/**
 * Opens the local database once (9.3). The change listener lets live queries refresh after sync.
 *
 * The open is asynchronous: on the web the first call starts the SQLite worker, which takes
 * longer than expo-sqlite's synchronous calls may wait. Drizzle's queries afterwards are fast.
 * Rejects if the database cannot be opened, e.g. on the web while another tab holds it (9.5).
 */
export function openDatabase(): Promise<Database> {
  opening ??= openDatabaseAsync('kcal.db', { enableChangeListener: true }).then((sqlite) => drizzle(sqlite, { schema }));
  return opening;
}
