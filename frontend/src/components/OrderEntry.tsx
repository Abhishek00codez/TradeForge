import { useState } from 'react';
import { Socket } from 'socket.io-client';

interface OrderEntryProps {
  socket: Socket | null;
  symbol: string;
}

export default function OrderEntry({ socket, symbol }: OrderEntryProps) {
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [type, setType] = useState<'limit' | 'market'>('limit');
  const [price, setPrice] = useState<string>('');
  const [qty, setQty] = useState<string>('');

  const [openOrders, setOpenOrders] = useState<any[]>([]);

  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!price && type === 'limit') return;
    if (!qty) return;

    try {
      const p = type === 'market' ? 0 : parseFloat(price);
      const q = parseFloat(qty);

      const payload = {
        userId: 'u1', // Hardcoded for demo
        symbol,
        side,
        type,
        price: p,
        qty: q
      };

      const res = await fetch('http://localhost:3000/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (data.restingOrder) {
        setOpenOrders(prev => [...prev, data.restingOrder]);
      }

      // Reset form somewhat
      if (type === 'market') {
        setQty('');
      }

    } catch (err) {
      console.error('Order placement failed', err);
    }
  };

  const handleCancel = async (orderId: string) => {
    try {
      await fetch(`http://localhost:3000/api/orders/${symbol}/${orderId}`, {
        method: 'DELETE'
      });
      setOpenOrders(prev => prev.filter(o => o.orderId !== orderId));
    } catch (err) {
      console.error('Cancel failed', err);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Order Entry</h2>

      <form onSubmit={handlePlaceOrder} className="space-y-4">
        <div className="flex bg-gray-900 rounded p-1">
          <button
            type="button"
            className={`flex-1 py-1 text-sm font-medium rounded ${side === 'buy' ? 'bg-green-600 text-white' : 'text-gray-400 hover:text-white'}`}
            onClick={() => setSide('buy')}
          >
            Buy
          </button>
          <button
            type="button"
            className={`flex-1 py-1 text-sm font-medium rounded ${side === 'sell' ? 'bg-red-600 text-white' : 'text-gray-400 hover:text-white'}`}
            onClick={() => setSide('sell')}
          >
            Sell
          </button>
        </div>

        <div className="flex gap-2">
           <button
            type="button"
            className={`flex-1 py-1 text-xs border rounded ${type === 'limit' ? 'border-blue-500 text-blue-400' : 'border-gray-700 text-gray-500'}`}
            onClick={() => setType('limit')}
          >
            Limit
          </button>
          <button
            type="button"
            className={`flex-1 py-1 text-xs border rounded ${type === 'market' ? 'border-blue-500 text-blue-400' : 'border-gray-700 text-gray-500'}`}
            onClick={() => { setType('market'); setPrice(''); }}
          >
            Market
          </button>
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">Price</label>
          <input
            type="number"
            step="0.01"
            disabled={type === 'market'}
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="w-full bg-gray-900 border border-gray-800 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 disabled:opacity-50"
            placeholder={type === 'market' ? 'Market' : '0.00'}
          />
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">Quantity</label>
          <input
            type="number"
            step="0.0001"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            className="w-full bg-gray-900 border border-gray-800 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
            placeholder="0.0000"
          />
        </div>

        <button
          type="submit"
          className={`w-full py-2 rounded font-bold text-white transition-colors ${side === 'buy' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}`}
        >
          {side === 'buy' ? 'Place Buy Order' : 'Place Sell Order'}
        </button>
      </form>

      <div className="mt-8">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 border-b border-gray-800 pb-1">Open Orders</h3>
        <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar">
          {openOrders.length === 0 ? (
            <p className="text-xs text-gray-600">No open orders.</p>
          ) : (
            openOrders.map(o => (
              <div key={o.orderId} className="flex justify-between items-center text-xs bg-gray-900 p-2 rounded">
                <div>
                  <span className={o.side === 'buy' ? 'text-green-400' : 'text-red-400'}>{o.side.toUpperCase()}</span>
                  <span className="ml-2 text-gray-300">{o.qty} @ {o.price}</span>
                </div>
                <button
                  onClick={() => handleCancel(o.orderId)}
                  className="text-gray-500 hover:text-red-400 px-2 py-1"
                >
                  Cancel
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
