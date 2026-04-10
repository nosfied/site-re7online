"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  AdminConnection,
  clearAdminConnection,
  loadAdminConnection,
  saveAdminConnection,
  testAdminConnection,
} from "@/lib/whatsappAdminApi";

type AdminConsoleContextValue = {
  connection: AdminConnection;
  setConnection: React.Dispatch<React.SetStateAction<AdminConnection>>;
  testingConnection: boolean;
  testConnection: (connection?: AdminConnection) => Promise<void>;
  logout: () => void;
  ready: boolean;
  isConnected: boolean;
};

const EMPTY_CONNECTION: AdminConnection = {
  baseUrl: "",
  adminToken: "",
  rememberToken: false,
};

const AdminConsoleContext = createContext<AdminConsoleContextValue | null>(null);

function isConnectionReady(connection: AdminConnection) {
  return Boolean(connection.baseUrl.trim() && connection.adminToken.trim());
}

export function AdminConsoleProvider({ children }: { children: React.ReactNode }) {
  const [connection, setConnection] = useState<AdminConnection>(EMPTY_CONNECTION);
  const [testingConnection, setTestingConnection] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setConnection(loadAdminConnection());
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (!connection.baseUrl && !connection.adminToken) {
      clearAdminConnection();
      return;
    }
    saveAdminConnection(connection);
  }, [connection, ready]);

  const value = useMemo<AdminConsoleContextValue>(
    () => ({
      connection,
      setConnection,
      testingConnection,
      async testConnection(nextConnection) {
        setTestingConnection(true);
        try {
          await testAdminConnection(nextConnection ?? connection);
        } finally {
          setTestingConnection(false);
        }
      },
      logout() {
        clearAdminConnection();
        setConnection(EMPTY_CONNECTION);
        if (typeof window !== "undefined") {
          window.location.reload();
        }
      },
      ready,
      isConnected: ready && isConnectionReady(connection),
    }),
    [connection, ready, testingConnection]
  );

  return <AdminConsoleContext.Provider value={value}>{children}</AdminConsoleContext.Provider>;
}

export function useAdminConsole() {
  const context = useContext(AdminConsoleContext);
  if (!context) {
    throw new Error("useAdminConsole must be used within AdminConsoleProvider");
  }
  return context;
}
