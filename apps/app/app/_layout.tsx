import { Stack, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { palette } from '../src/theme';
import { PersistenceNotice } from '../src/state/persistence-notice';
import { startOfflineApp } from '../src/offline/offline-app';

export default function RootLayout() {
  const pathname = usePathname();
  useEffect(() => {
    if (Platform.OS === 'web') return startOfflineApp();
  }, []);
  return (
    <>
      <StatusBar style={pathname === '/' || pathname.startsWith('/game/') ? 'light' : 'dark'} />
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
