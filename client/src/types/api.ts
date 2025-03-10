// Auth types
export interface LoginCredentials {
  username: string;
  password: string;
}

export interface User {
  id: number;
  username: string;
  role: 'ADMIN' | 'WRITER' | 'READER';
}

// Database types
export interface Database {
  id: number;
  name: string;
  host: string;
  port: number;
  username: string;
  // Add other fields
}

// Query monitoring types
export interface QueryMonitoringConfig {
  id?: number;
  databaseId: number;
  intervalMinutes: number;
  isActive: boolean;
  lastRunAt: string | null;
}

// Add more types as needed 