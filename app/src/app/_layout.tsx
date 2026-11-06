// crypto.getRandomValues for uuid and @noble/curves on Android (7.2)
import 'react-native-get-random-values';

import { Stack } from 'expo-router';
import { StyleSheet, useColorScheme, View } from 'react-native';
import { PaperProvider } from 'react-native-paper';
import { en, registerTranslation } from 'react-native-paper-dates';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { DatabaseProvider } from '../ui/DatabaseProvider';
import { SnackbarProvider } from '../ui/SnackbarProvider';
import { SyncProvider } from '../ui/SyncProvider';
import { darkTheme, lightTheme, MAX_CONTENT_WIDTH } from '../ui/theme';

registerTranslation('en', en);

/** Paper theme (follows the system light/dark setting), database with migrations and the sync engine (9.2). */
export default function RootLayout() {
  const theme = useColorScheme() === 'dark' ? darkTheme : lightTheme;

  return (
    <SafeAreaProvider>
      <PaperProvider theme={theme}>
        <View style={[styles.outer, { backgroundColor: theme.colors.background }]}>
          <View style={styles.column}>
            <DatabaseProvider>
              <SyncProvider>
                <SnackbarProvider>
                  <Stack
                    screenOptions={{
                      headerStyle: { backgroundColor: theme.colors.surface },
                      headerTintColor: theme.colors.onSurface,
                      contentStyle: { backgroundColor: theme.colors.background }
                    }}
                  >
                    <Stack.Screen name="index" options={{ title: 'Kcal' }} />
                    <Stack.Screen name="entry/new" options={{ title: 'Add entry' }} />
                    <Stack.Screen name="entry/[id]" options={{ title: 'Edit entry' }} />
                    <Stack.Screen name="import" options={{ title: 'AI import' }} />
                    <Stack.Screen name="targets" options={{ title: 'Targets' }} />
                    <Stack.Screen name="settings/index" options={{ title: 'Settings' }} />
                    <Stack.Screen name="settings/connect" options={{ title: 'Connect to server' }} />
                    <Stack.Screen name="settings/devices" options={{ title: 'Devices' }} />
                  </Stack>
                </SnackbarProvider>
              </SyncProvider>
            </DatabaseProvider>
          </View>
        </View>
      </PaperProvider>
    </SafeAreaProvider>
  );
}

// A phone-sized column, centred on wide screens.
const styles = StyleSheet.create({
  outer: { flex: 1, alignItems: 'center' },
  column: { flex: 1, width: '100%', maxWidth: MAX_CONTENT_WIDTH }
});
