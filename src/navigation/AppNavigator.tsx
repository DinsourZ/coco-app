import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ConnectionBanner } from '../components/ConnectionBanner';
import { EmergencyStopBar } from '../components/EmergencyStopBar';
import { ChatScreen } from '../screens/ChatScreen';
import { DevicesScreen } from '../screens/DevicesScreen';
import { PairingScreen } from '../screens/PairingScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { colors, MIN_TOUCH_TARGET, spacing } from '../theme/tokens';

export type AppTab = 'chat' | 'devices' | 'pairing' | 'settings';

const TABS: ReadonlyArray<{ id: AppTab; label: string }> = [
  { id: 'chat', label: 'Chat' },
  { id: 'devices', label: 'Devices' },
  { id: 'pairing', label: 'Pairing' },
  { id: 'settings', label: 'Settings' },
];

export function AppNavigator() {
  const [activeTab, setActiveTab] = useState<AppTab>('chat');

  return (
    <View style={styles.root}>
      <ConnectionBanner />
      <EmergencyStopBar />

      <View style={styles.body}>
        {activeTab === 'chat' ? <ChatScreen /> : null}
        {activeTab === 'devices' ? <DevicesScreen /> : null}
        {activeTab === 'pairing' ? <PairingScreen /> : null}
        {activeTab === 'settings' ? <SettingsScreen /> : null}
      </View>

      <View style={styles.tabBar} accessibilityRole="tablist">
        {TABS.map((tab) => {
          const active = tab.id === activeTab;
          return (
            <Pressable
              key={tab.id}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              style={[styles.tabItem, active && styles.tabItemActive]}
              onPress={() => setActiveTab(tab.id)}
            >
              <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  body: {
    flex: 1,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  tabItem: {
    flex: 1,
    minHeight: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  tabItemActive: {
    backgroundColor: colors.accentSoft,
  },
  tabLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textMuted,
  },
  tabLabelActive: {
    color: colors.accentDark,
  },
});
