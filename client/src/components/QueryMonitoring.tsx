import React, { useState, useEffect } from 'react';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';
import { api } from '@/lib/api';

interface QueryMonitoringProps {
  databaseId: number;
}

interface MonitoringSession {
  id: number;
  status: 'running' | 'stopped' | 'completed';
  pollingIntervalSeconds: number;
  scheduledEndTime?: string;
  startedAt: string;
  stoppedAt?: string;
}

export function QueryMonitoring({ databaseId }: QueryMonitoringProps) {
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [sessions, setSessions] = useState<MonitoringSession[]>([]);
  const [pollingInterval, setPollingInterval] = useState(60);
  const [scheduledEndTime, setScheduledEndTime] = useState<string>('');
  const [currentSession, setCurrentSession] = useState<MonitoringSession | null>(null);
  const { toast } = useToast();

  // Fetch monitoring sessions
  useEffect(() => {
    fetchSessions();
  }, [databaseId]);

  const fetchSessions = async () => {
    try {
      const response = await api.get(`/databases/${databaseId}/monitoring/sessions`);
      if (response.data.success) {
        setSessions(response.data.sessions);
        // Find the most recent running session
        const runningSession = response.data.sessions.find(
          (s: MonitoringSession) => s.status === 'running'
        );
        if (runningSession) {
          setCurrentSession(runningSession);
          setIsMonitoring(true);
        }
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to fetch monitoring sessions',
        variant: 'destructive',
      });
    }
  };

  const startMonitoring = async () => {
    try {
      const response = await api.post(`/databases/${databaseId}/monitoring/start`, {
        pollingIntervalSeconds: pollingInterval,
        scheduledEndTime: scheduledEndTime || undefined,
      });

      if (response.data.success) {
        setCurrentSession(response.data.session);
        setIsMonitoring(true);
        toast({
          title: 'Success',
          description: 'Query monitoring started',
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to start query monitoring',
        variant: 'destructive',
      });
    }
  };

  const stopMonitoring = async () => {
    if (!currentSession) return;

    try {
      const response = await api.post(`/databases/${currentSession.id}/monitoring/stop`);
      if (response.data.success) {
        setIsMonitoring(false);
        setCurrentSession(null);
        toast({
          title: 'Success',
          description: 'Query monitoring stopped',
        });
        fetchSessions();
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to stop query monitoring',
        variant: 'destructive',
      });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Query Monitoring</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex items-center space-x-2">
            <Switch
              checked={isMonitoring}
              onCheckedChange={(checked) => {
                if (checked) {
                  startMonitoring();
                } else {
                  stopMonitoring();
                }
              }}
            />
            <Label>Enable Query Monitoring</Label>
          </div>

          {isMonitoring && currentSession && (
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <Label>Polling Interval (seconds):</Label>
                <Input
                  type="number"
                  value={pollingInterval}
                  onChange={(e) => setPollingInterval(parseInt(e.target.value))}
                  min={1}
                  disabled={isMonitoring}
                />
              </div>
              <div className="flex items-center space-x-2">
                <Label>Scheduled End Time:</Label>
                <Input
                  type="datetime-local"
                  value={scheduledEndTime}
                  onChange={(e) => setScheduledEndTime(e.target.value)}
                  disabled={isMonitoring}
                />
              </div>
              <div className="text-sm text-muted-foreground">
                Status: {currentSession.status}
              </div>
              <div className="text-sm text-muted-foreground">
                Started: {new Date(currentSession.startedAt).toLocaleString()}
              </div>
            </div>
          )}

          {sessions.length > 0 && (
            <div className="mt-4">
              <h3 className="text-lg font-semibold mb-2">Monitoring History</h3>
              <div className="space-y-2">
                {sessions.map((session) => (
                  <div
                    key={session.id}
                    className="p-2 border rounded-md text-sm"
                  >
                    <div>Status: {session.status}</div>
                    <div>Started: {new Date(session.startedAt).toLocaleString()}</div>
                    {session.stoppedAt && (
                      <div>Stopped: {new Date(session.stoppedAt).toLocaleString()}</div>
                    )}
                    <div>Interval: {session.pollingIntervalSeconds} seconds</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
} 