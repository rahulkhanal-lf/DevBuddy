import { useEffect, useRef, useState, useCallback } from "react";

export interface PeerUser {
  id: string;
  name: string;
  email: string;
}

const WS_BASE = "ws://localhost:8000";
const MAX_RETRIES = 3;
const BASE_DELAY = 1500;

export function useCollaboration(mapId: string | null, token: string | null) {
  const [peers, setPeers] = useState<PeerUser[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef(0);
  const onMessageRef = useRef<((msg: object) => void) | null>(null);

  const sendUpdate = useCallback((msg: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  useEffect(() => {
    if (!mapId || !token) return;

    let cancelled = false;
    retryRef.current = 0;

    function connect() {
      if (cancelled) return;
      const ws = new WebSocket(`${WS_BASE}/ws/maps/${mapId}?token=${token}`);
      wsRef.current = ws;

      ws.onopen = () => {
        if (cancelled) { ws.close(); return; }
        setIsConnected(true);
        retryRef.current = 0;
      };

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === "presence") {
            setPeers(msg.users ?? []);
          } else if (onMessageRef.current) {
            onMessageRef.current(msg);
          }
        } catch {}
      };

      ws.onclose = () => {
        if (cancelled) return;
        setIsConnected(false);
        if (retryRef.current < MAX_RETRIES) {
          const delay = BASE_DELAY * Math.pow(2, retryRef.current);
          retryRef.current++;
          setTimeout(connect, delay);
        }
      };

      ws.onerror = () => {
        ws.close();
      };
    }

    connect();

    return () => {
      cancelled = true;
      wsRef.current?.close();
      wsRef.current = null;
      setPeers([]);
      setIsConnected(false);
    };
  }, [mapId, token]);

  function onMessage(handler: (msg: object) => void) {
    onMessageRef.current = handler;
  }

  return { peers, sendUpdate, isConnected, onMessage };
}
