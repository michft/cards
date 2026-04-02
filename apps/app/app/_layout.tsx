import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { palette } from '../src/theme';

export default function RootLayout() {
  return (
    <>
      <StatusBar style="dark" />
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
        <Stack.Screen name="game/[gameId]" options={{ title: 'Play' }} />
        <Stack.Screen name="rules" options={{ title: 'Rules' }} />
        <Stack.Screen name="settings" options={{ title: 'Settings' }} />
      </Stack>
    </>
  );
}
