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