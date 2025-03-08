import { NextResponse } from 'next/server';
import { getQueryMonitoringConfig } from './api/databases/[id]/query-monitoring/config';

async function testApi() {
  try {
    // Mock request and params
    const req = new Request('http://localhost:3000/api/databases/1/query-monitoring/config');
    const params = { id: '1' };
    
    // Call the API handler directly
    const response = await getQueryMonitoringConfig(req, { params });
    
    console.log('Response:', response);
  } catch (error) {
    console.error('Error testing API:', error);
  }
}

testApi(); 