import { Server as SocketIOServer } from 'socket.io';
import { Redis } from 'ioredis';

export class Broadcaster {
  private pubRedis: Redis;
  private subRedis: Redis;

  constructor(
    private io: SocketIOServer,
    redisUrl: string
  ) {
    this.pubRedis = new Redis(redisUrl);
    this.subRedis = new Redis(redisUrl);

    this.setupSubscriptions();
  }

  private setupSubscriptions() {
    this.subRedis.subscribe('market:deltas', 'market:trades', (err) => {
      if (err) console.error('Failed to subscribe to Redis channels:', err);
    });

    this.subRedis.on('message', (channel, message) => {
      try {
        const data = JSON.parse(message);
        if (channel === 'market:deltas') {
          this.io.to(`symbol:${data.symbol}`).emit('orderBookUpdate', data);
        } else if (channel === 'market:trades') {
          this.io.to(`symbol:${data.symbol}`).emit('trades', data);
        }
      } catch (e) {
        console.error('Redis message parse error:', e);
      }
    });
  }

  // Called by local Matching Engine to publish to Redis
  public publishOrderBook(symbol: string, seqId: number, orderBook: any) {
    const payload = JSON.stringify({ symbol, seqId, orderBook, ts: Date.now() });
    this.pubRedis.publish('market:deltas', payload).catch(console.error);
  }

  public publishTrades(symbol: string, seqId: number, trades: any[]) {
    const payload = JSON.stringify({ symbol, seqId, trades, ts: Date.now() });
    this.pubRedis.publish('market:trades', payload).catch(console.error);
  }

  public close() {
    this.pubRedis.quit();
    this.subRedis.quit();
  }
}
