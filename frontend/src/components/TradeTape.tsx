import { useEffect, useState } from 'react';
import { Socket } from 'socket.io-client';
import { format } from 'date-fns';

interface Trade {
  tradeId: string;
  price: number;
  qty: number;
  aggressorSide: 'buy' | 'sell';
  timestamp: number;
}

interface TradeTapeProps {
  socket: Socket | null;
}

export default function TradeTape({ socket }: TradeTapeProps) {
  const [trades, setTrades] = useState<Trade[]>([]);

  useEffect(() => {
    if (!socket) return;

    socket.on('trades', (data: any) => {
      setTrades((prev) => {
        const newTrades = [...data.trades, ...prev];
        return newTrades.slice(0, 50); // Keep last 50
      });
    });

    return () => {
      socket.off('trades');
    };
  }, [socket]);

  return (
    <div className="flex flex-col h-full">
      <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-2">Recent Trades</h2>

      <div className="flex text-xs text-gray-500 pb-1 border-b border-gray-800">
        <span className="w-1/3 pl-1">Price</span>
        <span className="w-1/3 text-right">Size</span>
        <span className="w-1/3 text-right pr-1">Time</span>
      </div>

      <div className="flex-1 overflow-y-auto mt-2 custom-scrollbar space-y-1">
        {trades.map((t) => (
          <div key={t.tradeId} className="flex text-xs font-mono">
            <span className={`w-1/3 pl-1 ${t.aggressorSide === 'buy' ? 'text-green-400' : 'text-red-400'}`}>
              {t.price.toFixed(2)}
            </span>
            <span className="w-1/3 text-right text-gray-300">
              {t.qty.toFixed(4)}
            </span>
            <span className="w-1/3 text-right pr-1 text-gray-500">
              {format(t.timestamp, 'HH:mm:ss')}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
