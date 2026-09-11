import { Stack } from 'expo-router';
import React from 'react';

import { useAuthStore } from '@/modules/auth/store';

export default function ProtectedRootLayout() {
  const { user } = useAuthStore();

  if (!user) {
    return null;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="settings/index" />
      <Stack.Screen name="settings/change-password" />
      <Stack.Screen name="settings/change-email" />
      <Stack.Screen name="settings/change-email-verify" />
      <Stack.Screen name="settings/delete-account" />
    </Stack>
  );
}
