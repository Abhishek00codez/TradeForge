import { EventEmitter } from 'events';
import { OrderBook, Order, Trade, Side, OrderType } from './OrderBook';
import { v4 as uuid } from 'uuid';

export class MatchingEngine extends EventEmitter {
  private orderBooks: Map<string, OrderBook> = new Map();
  private seqId: number = 0;

  constructor() {
    super();
  }

  private getOrderBook(symbol: string): OrderBook {
    let ob = this.orderBooks.get(symbol);
    if (!ob) {
      ob = new OrderBook(symbol);
      this.orderBooks.set(symbol, ob);
    }
    return ob;
  }

  public placeOrder(
    userId: string,
    symbol: string,
    side: Side,
    type: OrderType,
    price: number,
    qty: number
  ) {
    const order: Order = {
      orderId: uuid(),
      userId,
      symbol,
      side,
      type,
      price,
      qty,
      remQty: qty,
      timestamp: Date.now()
    };

    const ob = this.getOrderBook(symbol);
    const { trades, restingOrder } = ob.processOrder(order);

    const seqId = ++this.seqId;

    if (trades.length > 0) {
      this.emit('trades', { seqId, symbol, trades });
    }

    this.emit('orderBookUpdate', {
      seqId,
      symbol,
      orderBook: ob.getSnapshot(20) // emit top 20 levels
    });

    // For persistence
    this.emit('orderState', { order });

    return { orderId: order.orderId, trades, restingOrder };
  }

  public cancelOrder(symbol: string, orderId: string) {
    const ob = this.orderBooks.get(symbol);
    if (!ob) return false;

    const cancelled = ob.cancelOrder(orderId);
    if (cancelled) {
      const seqId = ++this.seqId;
      this.emit('orderBookUpdate', {
        seqId,
        symbol,
        orderBook: ob.getSnapshot(20)
      });
      // Emit state change for persistence
      this.emit('orderCancelled', { orderId });
    }
    return cancelled;
  }
}
