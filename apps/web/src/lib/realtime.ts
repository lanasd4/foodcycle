import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { io } from 'socket.io-client';
import { useToast } from '@/components/ui/toast';
import { useAuth } from './auth';
import type { Notification } from './types';

/** Which cached lists a notification type makes stale */
function staleKeys(type: string): string[][] {
  if (type.startsWith('offer.')) return [['offers'], ['recommended'], ['my-offers']];
  if (type.startsWith('claim.')) return [['claims'], ['incoming'], ['my-offers'], ['offers'], ['recommended'], ['offer']];
  if (type.startsWith('org.')) return [['me']];
  if (type.startsWith('rating.')) return [['ratings']];
  return [];
}

/**
 * Opens the Socket.IO channel while signed in. Each notification:
 *  - shows a toast,
 *  - refreshes the bell counter and the lists it affects,
 *  - refreshes the session when it concerns the account itself (verification).
 */
export function useRealtime() {
  const { token, status, refresh } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (status !== 'authenticated' || !token) return;
    const socket = io('/events', { auth: { token }, transports: ['websocket'] });
    socket.on('ready', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('notification', (n: Notification) => {
      toast({ tone: 'info', title: n.title, body: n.body });
      void qc.invalidateQueries({ queryKey: ['notifications'] });
      for (const key of staleKeys(n.type)) void qc.invalidateQueries({ queryKey: key });
      if (n.type.startsWith('org.')) void refresh();
    });
    return () => {
      socket.close();
      setConnected(false);
    };
  }, [status, token, qc, toast, refresh]);

  return connected;
}
