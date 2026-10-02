import { Injectable, MessageEvent } from '@nestjs/common';
import { merge, Observable, Subject, interval, map, of } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * One-way realtime channel for public QR menus.  Server-sent events suit this
 * use case because guests only receive catalog updates; they never send data
 * over this connection.
 */
@Injectable()
export class QrMenuEventsService {
  private readonly streams = new Map<string, Subject<MessageEvent>>();

  constructor(private readonly prisma: PrismaService) {}

  stream(slug: string): Observable<MessageEvent> {
    return merge(
      of({ type: 'connected', data: { updatedAt: new Date().toISOString() } } satisfies MessageEvent),
      this.forSlug(slug).asObservable(),
      // Keeps reverse proxies and mobile connections alive during quiet periods.
      interval(25_000).pipe(map(() => ({ type: 'heartbeat', data: { updatedAt: new Date().toISOString() } } satisfies MessageEvent))),
    );
  }

  publish(slug: string): void {
    this.forSlug(slug).next({ type: 'catalog-changed', data: { updatedAt: new Date().toISOString() } });
  }

  async publishForRestaurant(restaurantId: string): Promise<void> {
    const restaurant = await this.prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { slug: true } });
    if (restaurant) this.publish(restaurant.slug);
  }

  private forSlug(slug: string): Subject<MessageEvent> {
    let stream = this.streams.get(slug);
    if (!stream) {
      stream = new Subject<MessageEvent>();
      this.streams.set(slug, stream);
    }
    return stream;
  }
}
