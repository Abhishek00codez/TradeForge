import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { MatchingEngine } from './engine/MatchingEngine';
import { Broadcaster } from './streaming/Broadcaster';
import { WriteBehindWorker } from './persistence/WriteBehindWorker';

const app = express();
app.use(express.json());

const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: '*' } });

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const PG_URL = process.env.PG_URL || 'postgresql://postgres:postgres@localhost:5432/tradeforge';

const engine = new MatchingEngine();
const broadcaster = new Broadcaster(io, REDIS_URL);
const dbWorker = new WriteBehindWorker(PG_URL);

// Bridge Engine -> Streaming & DB
engine.on('orderBookUpdate', (data) => {
  broadcaster.publishOrderBook(data.symbol, data.seqId, data.orderBook);
});

engine.on('trades', (data) => {
  broadcaster.publishTrades(data.symbol, data.seqId, data.trades);
  for (const t of data.trades) {
    dbWorker.enqueueTrade(t);
  }
});

engine.on('orderState', (data) => {
  dbWorker.enqueueOrderState(data.order);
});

engine.on('orderCancelled', (data) => {
  dbWorker.enqueueOrderCancel(data.orderId);
});


io.on('connection', (socket) => {
  socket.on('subscribe', (symbol: string) => {
    socket.join(`symbol:${symbol}`);
  });
  socket.on('unsubscribe', (symbol: string) => {
    socket.leave(`symbol:${symbol}`);
  });
});

app.post('/api/orders', (req, res) => {
  const { userId, symbol, side, type, price, qty } = req.body;
  if (!userId || !symbol || !side || !type || typeof qty !== 'number') {
    return res.status(400).json({ error: 'invalid payload' });
  }

  const result = engine.placeOrder(userId, symbol, side, type, price, qty);
  res.json(result);
});

app.delete('/api/orders/:symbol/:orderId', (req, res) => {
  const { symbol, orderId } = req.params;
  const cancelled = engine.cancelOrder(symbol, orderId);
  res.json({ cancelled });
});

const PORT = process.env.PORT || 3000;

if (require.main === module) {
  httpServer.listen(PORT, () => {
    console.log(`TradeForge backend running on port ${PORT}`);
  });
}

export { app, httpServer, engine, io, dbWorker, broadcaster };
