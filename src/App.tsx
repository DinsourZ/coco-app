import React from 'react';
import { StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { CoCoProvider } from './context/CoCoContext';
import { AppNavigator } from './navigation/AppNavigator';
import { colors } from './theme/tokens';

export default function App() {
  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <StatusBar style="light" backgroundColor={colors.headerBg} />
        <CoCoProvider>
          <AppNavigator />
        </CoCoProvider>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.headerBg,
  },
});
