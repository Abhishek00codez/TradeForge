import { Pool } from 'pg';
import { Order, Trade } from '../engine/OrderBook';

export class WriteBehindWorker {
  private pool: Pool;
  private tradesQueue: Trade[] = [];
  private orderStateQueue: Order[] = [];
  private orderCancelQueue: string[] = [];
  private timer: NodeJS.Timeout | null = null;
  private readonly flushIntervalMs = 50;
  private readonly maxBatchSize = 500;

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString });
    this.start();
  }

  public enqueueTrade(trade: Trade) {
    this.tradesQueue.push(trade);
    this.checkFlush();
  }

  public enqueueOrderState(order: Order) {
    this.orderStateQueue.push(order);
    this.checkFlush();
  }

  public enqueueOrderCancel(orderId: string) {
    this.orderCancelQueue.push(orderId);
    this.checkFlush();
  }

  private start() {
    if (this.timer) return;
    this.timer = setInterval(() => this.flush(), this.flushIntervalMs);
  }

  public stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private checkFlush() {
    const totalItems = this.tradesQueue.length + this.orderStateQueue.length + this.orderCancelQueue.length;
    if (totalItems >= this.maxBatchSize) {
      this.flush();
    }
  }

  private async flush() {
    const trades = this.tradesQueue.splice(0, this.maxBatchSize);
    const orderStates = this.orderStateQueue.splice(0, this.maxBatchSize);
    const orderCancels = this.orderCancelQueue.splice(0, this.maxBatchSize);

    if (trades.length === 0 && orderStates.length === 0 && orderCancels.length === 0) return;

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Flush Order States
      if (orderStates.length > 0) {
        let orderQuery = 'INSERT INTO orders (order_id, user_id, symbol, side, type, price, qty, rem_qty, status) VALUES ';
        const orderVals: any[] = [];
        let valIdx = 1;

        for (const o of orderStates) {
          const status = o.remQty === 0 ? 'filled' : (o.remQty < o.qty ? 'partial' : 'open');
          orderQuery += `($${valIdx++}, $${valIdx++}, $${valIdx++}, $${valIdx++}, $${valIdx++}, $${valIdx++}, $${valIdx++}, $${valIdx++}, $${valIdx++}),`;
          orderVals.push(o.orderId, o.userId, o.symbol, o.side, o.type, o.price, o.qty, o.remQty, status);
        }
        orderQuery = orderQuery.slice(0, -1) + ` ON CONFLICT (order_id) DO UPDATE SET rem_qty = EXCLUDED.rem_qty, status = EXCLUDED.status, updated_at = CURRENT_TIMESTAMP;`;
        await client.query(orderQuery, orderVals);
      }

      // Flush Order Cancels
      if (orderCancels.length > 0) {
        await client.query('UPDATE orders SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE order_id = ANY($2::varchar[])', ['cancelled', orderCancels]);
      }

      // Flush Trades & Portfolio Deltas
      if (trades.length > 0) {
        let tradeQuery = 'INSERT INTO trades (trade_id, symbol, maker_order_id, taker_order_id, maker_user_id, taker_user_id, price, qty, aggressor_side) VALUES ';
        const tradeVals: any[] = [];
        let valIdx = 1;

        const portfolioUpdates: Record<string, Record<string, number>> = {};

        for (const t of trades) {
          tradeQuery += `($${valIdx++}, $${valIdx++}, $${valIdx++}, $${valIdx++}, $${valIdx++}, $${valIdx++}, $${valIdx++}, $${valIdx++}, $${valIdx++}),`;
          tradeVals.push(t.tradeId, t.symbol, t.makerOrderId, t.takerOrderId, t.makerUserId, t.takerUserId, t.price, t.qty, t.aggressorSide);

          // Calculate portfolio deltas
          const [baseAsset, quoteAsset] = t.symbol.split('-');
          const quoteDelta = t.price * t.qty;

          // Aggressor could be buyer or seller, maker is the opposite
          const takerIsBuyer = t.aggressorSide === 'buy';

          const buyerId = takerIsBuyer ? t.takerUserId : t.makerUserId;
          const sellerId = takerIsBuyer ? t.makerUserId : t.takerUserId;

          if (!portfolioUpdates[buyerId]) portfolioUpdates[buyerId] = { [baseAsset]: 0, [quoteAsset]: 0 };
          if (!portfolioUpdates[sellerId]) portfolioUpdates[sellerId] = { [baseAsset]: 0, [quoteAsset]: 0 };

          portfolioUpdates[buyerId][baseAsset] = (portfolioUpdates[buyerId][baseAsset] || 0) + t.qty;
          portfolioUpdates[buyerId][quoteAsset] = (portfolioUpdates[buyerId][quoteAsset] || 0) - quoteDelta;

          portfolioUpdates[sellerId][baseAsset] = (portfolioUpdates[sellerId][baseAsset] || 0) - t.qty;
          portfolioUpdates[sellerId][quoteAsset] = (portfolioUpdates[sellerId][quoteAsset] || 0) + quoteDelta;
        }

        tradeQuery = tradeQuery.slice(0, -1) + ' ON CONFLICT DO NOTHING;';
        await client.query(tradeQuery, tradeVals);

        // Apply portfolio deltas
        for (const [userId, deltas] of Object.entries(portfolioUpdates)) {
          for (const [asset, delta] of Object.entries(deltas)) {
            if (delta !== 0) {
              await client.query(
                `INSERT INTO portfolios (user_id, asset, balance) VALUES ($1, $2, $3)
                 ON CONFLICT (user_id, asset) DO UPDATE SET balance = portfolios.balance + EXCLUDED.balance`,
                [userId, asset, delta]
              );
            }
          }
        }
      }

      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      console.error('Batch DB write failed:', e);
    } finally {
      client.release();
    }
  }
}
