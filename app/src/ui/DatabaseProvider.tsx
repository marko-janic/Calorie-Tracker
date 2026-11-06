import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Text } from 'react-native-paper';

import migrations from '../../drizzle/migrations';
import { Database, openDatabase } from '../db/client';

const DatabaseContext = createContext<Database | null>(null);

/** The local database, opened and migrated by the root layout. */
export function useDatabase(): Database {
  const db = useContext(DatabaseContext);
  if (!db) {
    throw new Error('useDatabase must be used inside DatabaseProvider');
  }
  return db;
}

type OpenState = { db: Database; error: null } | { db: null; error: unknown } | null;

/** Opens the database and applies the migrations before rendering the app (9.3). */
export function DatabaseProvider({ children }: { children: ReactNode }) {
  const [opened, setOpened] = useState<OpenState>(null);

  useEffect(() => {
    openDatabase().then(
      (db) => setOpened({ db, error: null }),
      (error: unknown) => setOpened({ db: null, error })
    );
  }, []);

  if (!opened) {
    return <Loading />;
  }
  if (!opened.db) {
    // OPFS allows a single open database, so another tab is the usual cause on the web (9.5)
    const message = Platform.OS === 'web' ? 'Kcal is already open in another tab' : 'The local database could not be opened';
    return <Message text={message} detail={String(opened.error)} />;
  }
  return <Migrated db={opened.db}>{children}</Migrated>;
}

function Migrated({ db, children }: { db: Database; children: ReactNode }) {
  const { success, error } = useMigrations(db, migrations);
  if (error) {
    return <Message text="The local database could not be updated" detail={error.message} />;
  }
  if (!success) {
    return <Loading />;
  }
  return <DatabaseContext.Provider value={db}>{children}</DatabaseContext.Provider>;
}

function Loading() {
  return (
    <View style={styles.center}>
      <ActivityIndicator />
    </View>
  );
}

function Message({ text, detail }: { text: string; detail: string }) {
  return (
    <View style={styles.center}>
      <Text variant="titleMedium">{text}</Text>
      <Text variant="bodySmall" style={styles.detail}>
        {detail}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  detail: { marginTop: 8, opacity: 0.7 }
});
