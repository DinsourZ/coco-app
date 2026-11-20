import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import {
  HttpCoCoClient,
  InMemoryAuthStore,
  MockCoCoClient,
  openAppSocket,
  operatorErrorMessage,
  validateBackendUrl,
  type AppSocketHandle,
  type CoCoClient,
} from '@coco/api-client';
import {
  isObservationEnvironmentAvailable,
  type AccessRole,
  type AppSocketStatus,
  type DeviceInfo,
  type HealthInfo,
} from '@coco/protocol';

export type ConnectionMode = 'mock' | 'live';

export interface StopOutcome {
  ok: boolean;
  deviceId: string;
  message: string;
  timestamp: number;
}

export interface CoCoContextValue {
  mode: ConnectionMode;
  setMode: (mode: ConnectionMode) => void;
  backendUrl: string;
  setBackendUrl: (url: string) => void;
  allowInsecureLocalHttp: boolean;
  setAllowInsecureLocalHttp: (allow: boolean) => void;
  configError: string | null;
  authStore: InMemoryAuthStore;
  authRevision: number;
  setRoleToken: (role: AccessRole, token: string) => void;
  clearAllTokens: () => void;
  client: CoCoClient | null;
  health: HealthInfo | null;
  healthError: string | null;
  checkingHealth: boolean;
  refreshHealth: () => Promise<void>;
  socketStatus: AppSocketStatus;
  devices: DeviceInfo[];
  devicesLoading: boolean;
  devicesError: string | null;
  refreshDevices: () => Promise<void>;
  selectedDeviceId: string | null;
  setSelectedDeviceId: (deviceId: string | null) => void;
  selectedDevice: DeviceInfo | null;
  stopBusy: boolean;
  lastStopOutcome: StopOutcome | null;
  triggerEmergencyStop: (deviceId?: string) => Promise<StopOutcome>;
  isForeground: boolean;
}

const CoCoContext = createContext<CoCoContextValue | null>(null);

export function CoCoProvider({ children }: { children: React.ReactNode }) {
  // Default to Mock Mode so developers can run & test the mobile UI safely
  // with zero private servers or physical hardware required.
  const [mode, setModeState] = useState<ConnectionMode>('mock');
  const [backendUrl, setBackendUrl] = useState<string>(
    process.env.EXPO_PUBLIC_COCO_BACKEND_URL ?? '',
  );
  const [allowInsecureLocalHttp, setAllowInsecureLocalHttp] = useState<boolean>(false);

  const authStoreRef = useRef<InMemoryAuthStore | null>(null);
  if (!authStoreRef.current) {
    authStoreRef.current = new InMemoryAuthStore();
  }
  const authStore = authStoreRef.current;

  const mockClientRef = useRef<MockCoCoClient | null>(null);
  if (!mockClientRef.current) {
    mockClientRef.current = new MockCoCoClient();
  }

  const [authRevision, setAuthRevision] = useState(0);
  const [health, setHealth] = useState<HealthInfo | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [checkingHealth, setCheckingHealth] = useState(false);

  const [socketStatus, setSocketStatus] = useState<AppSocketStatus>('mock');
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [devicesLoading, setDevicesLoading] = useState(false);
  const [devicesError, setDevicesError] = useState<string | null>(null);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);

  const [stopBusy, setStopBusy] = useState(false);
  const [lastStopOutcome, setLastStopOutcome] = useState<StopOutcome | null>(null);
  const [isForeground, setIsForeground] = useState<boolean>(AppState.currentState === 'active');

  useEffect(() => {
    const unsubscribe = authStore.subscribe(() => {
      setAuthRevision(authStore.getRevision());
    });
    return unsubscribe;
  }, [authStore]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      setIsForeground(nextState === 'active');
    });
    return () => sub.remove();
  }, []);

  const { client, configError } = useMemo<{
    client: CoCoClient | null;
    configError: string | null;
  }>(() => {
    if (mode === 'mock') {
      return { client: mockClientRef.current!, configError: null };
    }
    try {
      validateBackendUrl(backendUrl, { allowInsecureLocalHttp });
      return {
        client: new HttpCoCoClient({
          config: { baseUrl: backendUrl, allowInsecureLocalHttp },
          auth: authStore,
        }),
        configError: null,
      };
    } catch (err) {
      return {
        client: null,
        configError: err instanceof Error ? err.message : 'Invalid backend URL configuration.',
      };
    }
  }, [mode, backendUrl, allowInsecureLocalHttp, authStore]);

  const setMode = useCallback((nextMode: ConnectionMode) => {
    setModeState(nextMode);
    setHealth(null);
    setHealthError(null);
    setDevices([]);
    setDevicesError(null);
    setSelectedDeviceId(null);
    setLastStopOutcome(null);
  }, []);

  const setRoleToken = useCallback(
    (role: AccessRole, token: string) => {
      authStore.setToken(role, token);
    },
    [authStore],
  );

  const clearAllTokens = useCallback(() => {
    authStore.clearAll();
  }, [authStore]);

  const refreshHealth = useCallback(async () => {
    if (!client) {
      setHealth(null);
      setHealthError(configError ?? 'Configure a valid HTTPS backend URL first.');
      return;
    }
    setCheckingHealth(true);
    try {
      const info = await client.health();
      setHealth(info);
      setHealthError(null);
    } catch (err) {
      setHealth(null);
      setHealthError(operatorErrorMessage(err, 'Unable to reach CoCo backend /health.'));
    } finally {
      setCheckingHealth(false);
    }
  }, [client, configError]);

  const refreshDevices = useCallback(async () => {
    if (!client) {
      setDevices([]);
      setDevicesError(configError ?? 'Configure a valid HTTPS backend URL first.');
      return;
    }
    if (mode === 'live' && !authStore.hasToken('console')) {
      setDevices([]);
      setDevicesError('Console in-memory token is required to read device state.');
      return;
    }
    setDevicesLoading(true);
    try {
      const list = await client.devices();
      setDevices(list);
      setDevicesError(null);
      setSelectedDeviceId((prev) => {
        if (prev && list.some((d) => d.device_id === prev)) return prev;
        const firstOnline = list.find((d) => d.online);
        return firstOnline?.device_id ?? list[0]?.device_id ?? null;
      });
    } catch (err) {
      setDevicesError(operatorErrorMessage(err, 'Failed to read device list.'));
    } finally {
      setDevicesLoading(false);
    }
  }, [client, configError, mode, authStore]);

  useEffect(() => {
    void refreshHealth();
    void refreshDevices();
  }, [refreshHealth, refreshDevices, authRevision]);

  // Manage live `/ws/app` subscription when in live mode with a console token
  useEffect(() => {
    if (mode === 'mock') {
      setSocketStatus('mock');
      return;
    }
    if (!client || configError) {
      setSocketStatus('disconnected');
      return;
    }
    if (!authStore.hasToken('console')) {
      setSocketStatus('no_token');
      return;
    }
    if (!isObservationEnvironmentAvailable({ isForeground, isOnline: true })) {
      setSocketStatus('disconnected');
      return;
    }

    let handle: AppSocketHandle | null = null;
    try {
      handle = openAppSocket({
        config: { baseUrl: backendUrl, allowInsecureLocalHttp },
        auth: authStore,
        onStatus: setSocketStatus,
        onMessage: (event) => {
          if (event.type === 'app.device_update') {
            void refreshDevices();
          }
        },
      });
    } catch {
      setSocketStatus('error');
    }

    return () => {
      handle?.close();
    };
  }, [
    mode,
    client,
    configError,
    backendUrl,
    allowInsecureLocalHttp,
    authStore,
    authRevision,
    isForeground,
    refreshDevices,
  ]);

  const selectedDevice = useMemo(
    () => devices.find((d) => d.device_id === selectedDeviceId) ?? null,
    [devices, selectedDeviceId],
  );

  const triggerEmergencyStop = useCallback(
    async (overrideDeviceId?: string): Promise<StopOutcome> => {
      const targetId = overrideDeviceId ?? selectedDeviceId;
      const now = Date.now();
      if (!targetId) {
        const outcome: StopOutcome = {
          ok: false,
          deviceId: 'none',
          message: 'No target device selected. Cannot issue STOP.',
          timestamp: now,
        };
        setLastStopOutcome(outcome);
        return outcome;
      }
      if (!client) {
        const outcome: StopOutcome = {
          ok: false,
          deviceId: targetId,
          message: configError ?? 'Backend not configured. STOP was NOT sent.',
          timestamp: now,
        };
        setLastStopOutcome(outcome);
        return outcome;
      }

      setStopBusy(true);
      try {
        const resp = await client.emergencyStop(targetId);
        const cmdId = typeof resp.sent?.id === 'string' ? resp.sent.id : 'confirmed';
        const outcome: StopOutcome = {
          ok: true,
          deviceId: targetId,
          message:
            mode === 'mock'
              ? `[Mock] Synthetic STOP acknowledged for ${targetId} (${cmdId}).`
              : `STOP dispatched to ${targetId} (${cmdId}). Verify physical stillness.`,
          timestamp: Date.now(),
        };
        setLastStopOutcome(outcome);
        void refreshDevices();
        return outcome;
      } catch (err) {
        const outcome: StopOutcome = {
          ok: false,
          deviceId: targetId,
          message: `STOP NOT CONFIRMED for ${targetId}: ${operatorErrorMessage(err, 'Dispatch failed.')}`,
          timestamp: Date.now(),
        };
        setLastStopOutcome(outcome);
        return outcome;
      } finally {
        setStopBusy(false);
      }
    },
    [selectedDeviceId, client, configError, mode, refreshDevices],
  );

  const value: CoCoContextValue = {
    mode,
    setMode,
    backendUrl,
    setBackendUrl,
    allowInsecureLocalHttp,
    setAllowInsecureLocalHttp,
    configError,
    authStore,
    authRevision,
    setRoleToken,
    clearAllTokens,
    client,
    health,
    healthError,
    checkingHealth,
    refreshHealth,
    socketStatus,
    devices,
    devicesLoading,
    devicesError,
    refreshDevices,
    selectedDeviceId,
    setSelectedDeviceId,
    selectedDevice,
    stopBusy,
    lastStopOutcome,
    triggerEmergencyStop,
    isForeground,
  };

  return <CoCoContext.Provider value={value}>{children}</CoCoContext.Provider>;
}

export function useCoCo(): CoCoContextValue {
  const ctx = useContext(CoCoContext);
  if (!ctx) {
    throw new Error('useCoCo must be used inside CoCoProvider');
  }
  return ctx;
}
