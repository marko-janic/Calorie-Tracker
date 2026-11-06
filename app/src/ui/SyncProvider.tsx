import { createContext, ReactNode, useContext, useEffect, useState, useSyncExternalStore } from 'react';

import * as deviceKey from '../crypto/deviceKey';
import { createSyncStore } from '../db/syncStore';
import { createApiClient } from '../sync/api';
import { SyncEngine } from '../sync/engine';
import { syncPlatform } from '../sync/platform';
import type { SyncSnapshot } from '../sync/status';
import { startSyncTriggers } from '../sync/triggers';
import { useDatabase } from './DatabaseProvider';

const SyncContext = createContext<SyncEngine | null>(null);

export function useSyncEngine(): SyncEngine {
  const engine = useContext(SyncContext);
  if (!engine) {
    throw new Error('useSyncEngine must be used inside SyncProvider');
  }
  return engine;
}

/** The live sync status (6.6). */
export function useSyncSnapshot(): SyncSnapshot {
  const engine = useSyncEngine();
  return useSyncExternalStore(engine.subscribe, engine.getSnapshot);
}

/** Creates the sync engine for the local database and starts its triggers. */
export function SyncProvider({ children }: { children: ReactNode }) {
  const db = useDatabase();
  const [engine] = useState(
    () => new SyncEngine({ store: createSyncStore(db), deviceKey, createApi: createApiClient, platform: syncPlatform })
  );

  useEffect(() => {
    const stopTriggers = startSyncTriggers(engine);
    return () => {
      stopTriggers();
      engine.dispose();
    };
  }, [engine]);

  return <SyncContext.Provider value={engine}>{children}</SyncContext.Provider>;
}
