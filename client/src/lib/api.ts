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
  
  // Make the request
  const response = await fetch(url, {
    ...options,
    headers
  });
  
  // Check for error status
  if (!response.ok) {
    const error = new Error(`API request failed: ${response.status}`);
    throw error;
  }
  
  // Parse JSON response
  return await response.json();
};

export const api = {
  auth: {
    login: (credentials) => apiRequest('/auth/login', { 
      method: 'POST', 
      body: JSON.stringify(credentials) 
    }),
    logout: () => apiRequest('/auth/logout', { method: 'POST' }),
    register: (userData) => apiRequest('/auth/register', { 
      method: 'POST', 
      body: JSON.stringify(userData) 
    }),
  },
  users: {
    me: () => apiRequest('/users/me'),
    list: () => apiRequest('/users'),
    updateRole: (id, role) => apiRequest(`/users/${id}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ role })
    }),
    approve: (id) => apiRequest(`/users/${id}/approve`, { method: 'POST' }),
  },
  databases: {
    list: () => apiRequest('/databases'),
    get: (id) => apiRequest(`/databases/${id}`),
    test: (id) => apiRequest(`/databases/${id}/test`, { method: 'POST' }),
    metrics: (id) => apiRequest(`/databases/${id}/metrics`),
    create: (data) => apiRequest('/databases', { 
      method: 'POST', 
      body: JSON.stringify(data) 
    }),
    update: (id, data) => apiRequest(`/databases/${id}`, { 
      method: 'PUT', 
      body: JSON.stringify(data) 
    }),
    delete: (id) => apiRequest(`/databases/${id}`, { method: 'DELETE' }),
    queryMonitoring: {
      getConfig: (id) => apiRequest(`/databases/${id}/query-monitoring/config`),
      updateConfig: (id, config) => apiRequest(`/databases/${id}/query-monitoring/config`, {
        method: 'POST',
        body: JSON.stringify(config)
      }),
      start: (id) => apiRequest(`/databases/${id}/query-monitoring/start`, { method: 'POST' }),
      getQueries: (id, params = {}) => {
        const queryString = new URLSearchParams(params).toString();
        return apiRequest(`/databases/${id}/discovered-queries?${queryString}`);
      },
      updateQuery: (id, queryData) => apiRequest(`/databases/${id}/discovered-queries`, {
        method: 'PATCH',
        body: JSON.stringify(queryData)
      }),
    },
  },
  // Add other API sections (clusters, instances, etc.)
}; 