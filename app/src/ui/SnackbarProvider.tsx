import { createContext, ReactNode, useCallback, useContext, useState } from 'react';
import { Snackbar } from 'react-native-paper';

interface SnackbarAction {
  label: string;
  onPress: () => void;
}

type ShowSnackbar = (message: string, action?: SnackbarAction) => void;

const SnackbarContext = createContext<ShowSnackbar | null>(null);

/** Shows a snackbar that survives navigation, e.g. the Undo after deleting an entry. */
export function useSnackbar(): ShowSnackbar {
  const show = useContext(SnackbarContext);
  if (!show) {
    throw new Error('useSnackbar must be used inside SnackbarProvider');
  }
  return show;
}

export function SnackbarProvider({ children }: { children: ReactNode }) {
  const [snackbar, setSnackbar] = useState<{ message: string; action?: SnackbarAction; key: number } | null>(null);
  const show = useCallback<ShowSnackbar>((message, action) => setSnackbar({ message, action, key: Date.now() }), []);

  return (
    <SnackbarContext.Provider value={show}>
      {children}
      <Snackbar
        key={snackbar?.key}
        visible={snackbar !== null}
        onDismiss={() => setSnackbar(null)}
        action={snackbar?.action}
        duration={5000}
      >
        {snackbar?.message ?? ''}
      </Snackbar>
    </SnackbarContext.Provider>
  );
}
