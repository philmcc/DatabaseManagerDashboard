import { useLocation } from 'wouter';

interface LoginCredentials {
  username: string;
  password: string;
}

interface UserData {
  username: string;
  password: string;
  role?: string;
}

interface DatabaseData {
  name: string;
  host: string;
  port: number;
  [key: string]: any;
}

// Create a new helper file for API calls
export const API_BASE = '/api';

export const apiRequest = async (endpoint: string, options: RequestInit = {}) => {
  // Ensure endpoint starts with a slash
  const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const url = `${API_BASE}${path}`;
  
  // Set default headers
  const headers = {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    ...options.headers
  };
  
  try {
    // Make the request
    const response = await fetch(url, {
      ...options,
      headers,
      credentials: 'include',
    });
    
    // Handle auth endpoints separately
    if (endpoint.startsWith('/auth/')) {
      if (!response.ok) {
        const error = new Error('Authentication failed');
        error.message = await response.text();
        throw error;
      }
      return response.json();
    }
    
    // For non-auth endpoints, handle 401/403 with redirect
    if (response.status === 401 || response.status === 403) {
      window.location.href = '/auth';
      return null;
    }
    
    // Handle other errors
    if (!response.ok) {
      const error = new Error('API request failed');
      error.message = await response.text();
      throw error;
    }
    
    return response.json();
  } catch (error) {
    // If it's already handled (like auth redirect), just return null
    if (error.handled) {
      return null;
    }
    throw error;
  }
};

export const api = {
  auth: {
    login: (credentials: LoginCredentials) => apiRequest('/auth/login', { 
      method: 'POST', 
      body: JSON.stringify(credentials) 
    }),
    logout: () => apiRequest('/auth/logout', { method: 'POST' }),
    register: (userData: UserData) => apiRequest('/auth/register', { 
      method: 'POST', 
      body: JSON.stringify(userData) 
    }),
  },
  users: {
    me: () => apiRequest('/users/me'),
    list: () => apiRequest('/users'),
    updateRole: (id: number, role: string) => apiRequest(`/users/${id}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ role })
    }),
    approve: (id: number) => apiRequest(`/users/${id}/approve`, { method: 'POST' }),
  },
  databases: {
    list: () => apiRequest('/databases'),
    get: (id: number) => apiRequest(`/databases/${id}`),
    test: (id: number) => apiRequest(`/databases/${id}/test`, { method: 'POST' }),
    metrics: (id: number) => apiRequest(`/databases/${id}/metrics`),
    create: (data: DatabaseData) => apiRequest('/databases', { 
      method: 'POST', 
      body: JSON.stringify(data) 
    }),
    update: (id: number, data: DatabaseData) => apiRequest(`/databases/${id}`, { 
      method: 'PUT', 
      body: JSON.stringify(data) 
    }),
    delete: (id: number) => apiRequest(`/databases/${id}`, { method: 'DELETE' }),
    queryMonitoring: {
      getConfig: (id: number) => apiRequest(`/databases/${id}/query-monitoring/config`),
      updateConfig: (id: number, config: any) => apiRequest(`/databases/${id}/query-monitoring/config`, {
        method: 'POST',
        body: JSON.stringify(config)
      }),
      start: (id: number) => apiRequest(`/databases/${id}/query-monitoring/start`, { method: 'POST' }),
      getQueries: (id: number, params: Record<string, any> = {}) => {
        const queryString = new URLSearchParams(params).toString();
        return apiRequest(`/databases/${id}/discovered-queries?${queryString}`);
      },
      updateQuery: (id: number, queryData: any) => apiRequest(`/databases/${id}/discovered-queries`, {
        method: 'PATCH',
        body: JSON.stringify(queryData)
      }),
    },
  },
  // Add other API sections (clusters, instances, etc.)
}; 