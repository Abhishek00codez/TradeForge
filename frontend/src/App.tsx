import { useEffect, useState, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import OrderBook from './components/OrderBook';
import TradeTape from './components/TradeTape';
import OrderEntry from './components/OrderEntry';
import { Activity } from 'lucide-react';

const WEBSOCKET_URL = import.meta.env.VITE_WEBSOCKET_URL || 'http://localhost:3000';

function App() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [latencyP99, setLatencyP99] = useState<number>(0);
  const [opsSec, setOpsSec] = useState<number>(0);

  const latencies = useRef<number[]>([]);
  const opsCount = useRef<number>(0);

  const symbol = 'BTC-USD';

  useEffect(() => {
    const s = io(WEBSOCKET_URL);
    setSocket(s);

    s.on('connect', () => {
      setConnected(true);
      s.emit('subscribe', symbol);
    });

    s.on('disconnect', () => {
      setConnected(false);
    });

    s.on('orderBookUpdate', (data: any) => {
      if (data.ts) {
        latencies.current.push(Date.now() - data.ts);
      }
      opsCount.current++;
    });

    s.on('trades', (data: any) => {
      if (data.ts) {
        latencies.current.push(Date.now() - data.ts);
      }
      opsCount.current++;
    });

    const interval = setInterval(() => {
      // Calculate Ops/Sec
      setOpsSec(opsCount.current);
      opsCount.current = 0;

      // Calculate p99 latency
      if (latencies.current.length > 0) {
        const sorted = [...latencies.current].sort((a, b) => a - b);
        const p99 = sorted[Math.floor(sorted.length * 0.99)];
        setLatencyP99(p99);
        latencies.current = []; // reset for next window
      }
    }, 1000);

    return () => {
      clearInterval(interval);
      s.emit('unsubscribe', symbol);
      s.disconnect();
    };
  }, [symbol]);

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-4 font-sans">
      <header className="flex items-center justify-between border-b border-gray-800 pb-4 mb-4">
        <h1 className="text-2xl font-bold tracking-tighter text-blue-400">TradeForge</h1>
        <div className="flex gap-4 items-center text-sm">
          <div className="flex items-center gap-1">
            <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`}></span>
            {connected ? 'Connected' : 'Disconnected'}
          </div>
          <div className="flex items-center gap-4 text-gray-400 border-l border-gray-700 pl-4">
            <div className="flex items-center gap-1">
              <Activity size={16} className="text-blue-400" />
              <span>{opsSec} ops/sec</span>
            </div>
            <div className="flex items-center gap-1">
              <span>p99 Latency: <strong className={latencyP99 < 25 ? "text-green-400" : "text-yellow-400"}>{latencyP99}ms</strong></span>
            </div>
          </div>
        </div>
      </header>

      <main className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 border border-gray-800 rounded bg-gray-950 p-4">
          <OrderEntry socket={socket} symbol={symbol} />
        </div>

        <div className="lg:col-span-1 border border-gray-800 rounded bg-gray-950 p-4 overflow-hidden">
          <OrderBook socket={socket} />
        </div>

        <div className="lg:col-span-1 border border-gray-800 rounded bg-gray-950 p-4 overflow-hidden">
          <TradeTape socket={socket} />
        </div>
      </main>
    </div>
  );
}

export default App;
