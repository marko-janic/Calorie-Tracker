/** Local entry reads and writes (9.3). Every write marks the row dirty and schedules a sync. */
import { and, asc, eq } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';

import { getEatenLocalDate, nextUpdatedAt } from '../domain/time';
import type { EntryInput, LocalEntry } from '../domain/types';
import { notifyLocalChange } from './changes';
import type { Database } from './client';
import { entryFromRow } from './mappers';
import { entries } from './schema';

/** Live query of the entries of one day (deleted entries excluded). */
export function entriesOfDayQuery(db: Database, localDate: string) {
  return db
    .select()
    .from(entries)
    .where(and(eq(entries.eatenLocalDate, localDate), eq(entries.deleted, false)))
    .orderBy(asc(entries.eatenAt));
}

/** Live query of one entry. */
export function entryQuery(db: Database, id: string) {
  return db.select().from(entries).where(eq(entries.id, id));
}

export function getEntry(db: Database, id: string): LocalEntry | undefined {
  const row = db.select().from(entries).where(eq(entries.id, id)).get();
  return row ? entryFromRow(row) : undefined;
}

/** Creates entries with new ids and loggedAt = now (one transaction, e.g. an AI import). */
export function createEntries(db: Database, inputs: EntryInput[], now: Date = new Date()): string[] {
  const timestamp = now.toISOString();
  const rows = inputs.map((input) => ({
    ...input,
    id: uuidv7(),
    eatenLocalDate: getEatenLocalDate(input.eatenAt),
    loggedAt: timestamp,
    updatedAt: timestamp,
    deleted: false,
    version: null,
    dirty: true
  }));
  db.transaction((tx) => {
    for (const row of rows) {
      tx.insert(entries).values(row).run();
    }
  });
  notifyLocalChange();
  return rows.map((row) => row.id);
}

export function createEntry(db: Database, input: EntryInput, now: Date = new Date()): string {
  return createEntries(db, [input], now)[0];
}

export function updateEntry(db: Database, id: string, input: EntryInput): void {
  write(db, id, { ...input, eatenLocalDate: getEatenLocalDate(input.eatenAt) });
}

/** Deleting sets the tombstone; undo is a normal edit (9.2). */
export function setEntryDeleted(db: Database, id: string, deleted: boolean): void {
  write(db, id, { deleted });
}

function write(db: Database, id: string, changes: Partial<LocalEntry>): void {
  db.transaction((tx) => {
    const current = tx.select({ updatedAt: entries.updatedAt }).from(entries).where(eq(entries.id, id)).get();
    if (!current) {
      throw new Error(`Entry ${id} does not exist`);
    }
    tx.update(entries)
      .set({ ...changes, updatedAt: nextUpdatedAt(current.updatedAt), dirty: true })
      .where(eq(entries.id, id))
      .run();
  });
  notifyLocalChange();
}
