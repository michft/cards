import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { palette } from '../src/theme';
import { PersistenceNotice } from '../src/state/persistence-notice';

export default function RootLayout() {
  return (
    <>
      <StatusBar style="dark" />
      <PersistenceNotice />
      <Stack
        screenOptions={{
          headerStyle: {
            backgroundColor: palette.paper,
          },
          headerTintColor: palette.ink,
          contentStyle: {
            backgroundColor: palette.table,
          },
          headerShadowVisible: false,
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="game/[gameId]" options={{ headerShown: false }} />
        <Stack.Screen name="rules" options={{ title: 'Rules' }} />
        <Stack.Screen name="settings" options={{ title: 'Settings' }} />
      </Stack>
    </>
  );
}
