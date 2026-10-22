import { useEffect, useState } from 'react';
import { Socket } from 'socket.io-client';

interface Level {
  price: number;
  volume: number;
}

interface OrderBookProps {
  socket: Socket | null;
}

export default function OrderBook({ socket }: OrderBookProps) {
  const [bids, setBids] = useState<Level[]>([]);
  const [asks, setAsks] = useState<Level[]>([]);
  const [maxVol, setMaxVol] = useState<number>(0);

  useEffect(() => {
    if (!socket) return;

    socket.on('orderBookUpdate', (data: any) => {
      const b: Level[] = data.orderBook.bids || [];
      const a: Level[] = data.orderBook.asks || [];

      setBids(b);
      // Asks come sorted ascending (best ask first), reverse them to show highest ask at top
      setAsks([...a].reverse());

      const maxB = Math.max(...b.map((l) => l.volume), 0);
      const maxA = Math.max(...a.map((l) => l.volume), 0);
      setMaxVol(Math.max(maxB, maxA));
    });

    return () => {
      socket.off('orderBookUpdate');
    };
  }, [socket]);

  const renderLevel = (level: Level, isAsk: boolean) => {
    const depthPct = maxVol > 0 ? (level.volume / maxVol) * 100 : 0;
    const color = isAsk ? 'text-red-400' : 'text-green-400';
    const bgOpacity = isAsk ? 'bg-red-900/20' : 'bg-green-900/20';

    return (
      <div key={level.price} className="relative flex justify-between text-xs py-0.5 z-10 group">
        <div
          className={`absolute top-0 right-0 h-full ${bgOpacity} -z-10 transition-all duration-100`}
          style={{ width: `${depthPct}%` }}
        ></div>
        <span className={`${color} font-mono w-1/3 text-left pl-1`}>{level.price.toFixed(2)}</span>
        <span className="text-gray-300 font-mono w-1/3 text-right pr-1">{level.volume.toFixed(4)}</span>
      </div>
    );
  };

  const spread = asks.length > 0 && bids.length > 0 ? asks[asks.length - 1].price - bids[0].price : 0;

  return (
    <div className="flex flex-col h-full">
      <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-2">Order Book</h2>

      <div className="flex text-xs text-gray-500 pb-1 border-b border-gray-800">
        <span className="w-1/3 text-left pl-1">Price</span>
        <span className="w-1/3 text-right pr-1">Size</span>
      </div>

      <div className="flex-1 overflow-y-auto mt-2 custom-scrollbar">
        {/* Asks (sell orders) */}
        <div className="flex flex-col justify-end min-h-[50%]">
          {asks.map((ask) => renderLevel(ask, true))}
        </div>

        {/* Spread */}
        <div className="py-2 text-center text-xs font-mono text-gray-400 border-y border-gray-800 my-1">
          Spread: {spread > 0 ? spread.toFixed(2) : '-.--'}
        </div>

        {/* Bids (buy orders) */}
        <div className="flex flex-col justify-start min-h-[50%]">
          {bids.map((bid) => renderLevel(bid, false))}
        </div>
      </div>
    </div>
  );
}
