import { MatchingEngine } from '../src/engine/MatchingEngine';
import { io } from 'socket.io-client';

const NUM_ORDERS = 50000;
const NUM_CLIENTS = 500;
const SYMBOL = 'BTC-USD';

async function runBenchmark() {
  console.log('--- TradeForge Benchmark Suite ---');

  // 1. Throughput Benchmark
  console.log(`\nStarting throughput benchmark (${NUM_ORDERS} orders)...`);
  const engine = new MatchingEngine();

  // Seed book
  for(let i = 0; i < 100; i++) {
    engine.placeOrder('mm1', SYMBOL, 'buy', 'limit', 9900 - i, 1);
    engine.placeOrder('mm1', SYMBOL, 'sell', 'limit', 10100 + i, 1);
  }

  const start = performance.now();
  for (let i = 0; i < NUM_ORDERS; i++) {
    const side = Math.random() > 0.5 ? 'buy' : 'sell';
    const price = 10000 + Math.floor((Math.random() - 0.5) * 500);
    const qty = Math.random() * 2;
    engine.placeOrder('u1', SYMBOL, side, 'limit', price, qty);
  }
  const end = performance.now();
  const timeMs = end - start;
  const opsSec = (NUM_ORDERS / timeMs) * 1000;

  console.log(`Throughput Result:`);
  console.log(`- Orders processed: ${NUM_ORDERS}`);
  console.log(`- Time taken: ${timeMs.toFixed(2)} ms`);
  console.log(`- Operations/sec: ${opsSec.toFixed(2)} ops/sec`);

  if (opsSec < 10000) {
    console.warn('⚠️ Throughput is below 10,000 ops/sec requirement.');
  } else {
    console.log('✅ Throughput exceeds 10,000 ops/sec requirement.');
  }

  // 2. Latency Benchmark
  console.log(`\nStarting latency benchmark (${NUM_CLIENTS} concurrent connections)...`);
  console.log('Spawning clients... (Requires backend server to be running on localhost:3000)');

  const clients: any[] = [];
  const latencies: number[] = [];

  try {
    const connectPromises = [];
    for (let i = 0; i < NUM_CLIENTS; i++) {
      const socket = io('http://localhost:3000', { reconnection: false, timeout: 5000 });
      connectPromises.push(new Promise<void>((resolve, reject) => {
        socket.on('connect', () => {
          socket.emit('subscribe', SYMBOL);
          resolve();
        });
        socket.on('connect_error', reject);

        socket.on('orderBookUpdate', (data) => {
          if (data.ts) {
            latencies.push(Date.now() - data.ts);
          }
        });
      }));
      clients.push(socket);
    }

    await Promise.all(connectPromises);
    console.log(`All ${NUM_CLIENTS} clients connected. Simulating load for 3 seconds...`);

    // Simulate some traffic against the API via standard fetch
    for(let i=0; i< 50; i++) {
       await fetch('http://localhost:3000/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 'bench', symbol: SYMBOL, side: 'buy', type: 'limit', price: 10000, qty: 1 })
      }).catch(() => {});
      await new Promise(r => setTimeout(r, 10)); // Delay slightly to let WS flush
    }

    await new Promise(r => setTimeout(r, 2000)); // wait for trailing events

    clients.forEach(c => c.disconnect());

    if (latencies.length > 0) {
      latencies.sort((a, b) => a - b);
      const p50 = latencies[Math.floor(latencies.length * 0.5)];
      const p95 = latencies[Math.floor(latencies.length * 0.95)];
      const p99 = latencies[Math.floor(latencies.length * 0.99)];

      console.log(`Latency Results (from ${latencies.length} samples):`);
      console.log(`- p50: ${p50} ms`);
      console.log(`- p95: ${p95} ms`);
      console.log(`- p99: ${p99} ms`);

      if (p99 > 25) {
        console.warn('⚠️ p99 latency exceeds 25ms.');
      } else {
        console.log('✅ p99 latency is sub-25ms.');
      }
    } else {
      console.log('No latency samples collected. Ensure backend is running and producing events.');
    }

  } catch (e: any) {
    console.error('Latency benchmark failed. Make sure the backend server is running (npm start).', e.message);
  } finally {
    clients.forEach(c => c.disconnect());
    process.exit(0);
  }
}

runBenchmark();
