import { v4 as uuid } from 'uuid';

export type Side = 'buy' | 'sell';
export type OrderType = 'limit' | 'market';

export interface Order {
  orderId: string;
  userId: string;
  symbol: string;
  side: Side;
  type: OrderType;
  price: number;
  qty: number;
  remQty: number;
  timestamp: number;
}

export interface Trade {
  tradeId: string;
  symbol: string;
  makerOrderId: string;
  takerOrderId: string;
  makerUserId: string;
  takerUserId: string;
  price: number;
  qty: number;
  aggressorSide: Side;
  timestamp: number;
}

export class OrderNode {
  prev: OrderNode | null = null;
  next: OrderNode | null = null;
  constructor(public order: Order, public level: PriceLevel) {}
}

export class PriceLevel {
  head: OrderNode | null = null;
  tail: OrderNode | null = null;
  volume: number = 0;
  constructor(public price: number) {}

  add(node: OrderNode) {
    if (!this.head) {
      this.head = node;
      this.tail = node;
    } else {
      node.prev = this.tail;
      this.tail!.next = node;
      this.tail = node;
    }
    this.volume += node.order.remQty;
  }

  remove(node: OrderNode) {
    if (node.prev) node.prev.next = node.next;
    else this.head = node.next;

    if (node.next) node.next.prev = node.prev;
    else this.tail = node.prev;

    node.prev = null;
    node.next = null;
    this.volume -= node.order.remQty;
  }
}

export class OrderBook {
  public bidLevels: PriceLevel[] = [];
  public askLevels: PriceLevel[] = [];
  private orderMap: Map<string, OrderNode> = new Map();

  constructor(public readonly symbol: string) {}

  // hot-path: match against resting liquidity
  public processOrder(order: Order): { trades: Trade[], restingOrder: Order | null } {
    let remQty = order.remQty;
    const trades: Trade[] = [];
    const isBuy = order.side === 'buy';

    const levels = isBuy ? this.askLevels : this.bidLevels;

    while (remQty > 0 && levels.length > 0) {
      const bestLevel = levels[0];

      if (order.type === 'limit') {
        if (isBuy && order.price < bestLevel.price) break;
        if (!isBuy && order.price > bestLevel.price) break;
      }

      let currNode = bestLevel.head;
      while (currNode && remQty > 0) {
        const restingOrder = currNode.order;
        const fillQty = Math.min(remQty, restingOrder.remQty);

        remQty -= fillQty;
        restingOrder.remQty -= fillQty;
        bestLevel.volume -= fillQty;

        trades.push({
          tradeId: uuid(),
          symbol: this.symbol,
          makerOrderId: restingOrder.orderId,
          takerOrderId: order.orderId,
          makerUserId: restingOrder.userId,
          takerUserId: order.userId,
          price: bestLevel.price,
          qty: fillQty,
          aggressorSide: order.side,
          timestamp: Date.now()
        });

        if (restingOrder.remQty === 0) {
          const nextNode = currNode.next;
          bestLevel.remove(currNode);
          this.orderMap.delete(restingOrder.orderId);
          currNode = nextNode;
        } else {
          break;
        }
      }

      if (bestLevel.head === null) {
        levels.shift();
      }
    }

    order.remQty = remQty;

    if (remQty > 0 && order.type === 'limit') {
      this.addOrder(order);
      return { trades, restingOrder: order };
    }

    return { trades, restingOrder: null };
  }

  private addOrder(order: Order) {
    const isBuy = order.side === 'buy';
    const levels = isBuy ? this.bidLevels : this.askLevels;

    let levelIndex = -1;
    // bids: descending, asks: ascending
    for (let i = 0; i < levels.length; i++) {
      if (levels[i].price === order.price) {
        levelIndex = i;
        break;
      }
      if (isBuy && order.price > levels[i].price) {
        levelIndex = i;
        levels.splice(i, 0, new PriceLevel(order.price));
        break;
      }
      if (!isBuy && order.price < levels[i].price) {
        levelIndex = i;
        levels.splice(i, 0, new PriceLevel(order.price));
        break;
      }
    }

    if (levelIndex === -1) {
      levels.push(new PriceLevel(order.price));
      levelIndex = levels.length - 1;
    }

    const level = levels[levelIndex];
    const node = new OrderNode(order, level);
    level.add(node);
    this.orderMap.set(order.orderId, node);
  }

  // O(1) order cancellation
  public cancelOrder(orderId: string): boolean {
    const node = this.orderMap.get(orderId);
    if (!node) return false;

    const level = node.level;
    level.remove(node);
    this.orderMap.delete(orderId);

    if (level.head === null) {
      const isBuy = node.order.side === 'buy';
      const levels = isBuy ? this.bidLevels : this.askLevels;
      const idx = levels.indexOf(level);
      if (idx !== -1) levels.splice(idx, 1);
    }

    return true;
  }

  public getSnapshot(depth: number = 10) {
    const bids = this.bidLevels.slice(0, depth).map(l => ({ price: l.price, volume: l.volume }));
    const asks = this.askLevels.slice(0, depth).map(l => ({ price: l.price, volume: l.volume }));
    return { bids, asks };
  }
}
