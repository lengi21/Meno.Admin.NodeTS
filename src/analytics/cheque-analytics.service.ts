import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ChequeStatus, Prisma } from '@prisma/client';
import type { AdminTokenPayload } from '../auth/auth.types.js';
import { AdminAccessService } from '../admin/admin-access.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

type SortKey = 'openedAt' | 'chequeNumber' | 'owner' | 'hall' | 'table' | 'amount' | 'discountPercent' | 'total' | 'payment' | 'clientPaid' | 'closedAt';
type SortRule = { readonly key: SortKey; readonly direction: 'asc' | 'desc' };
type ReceiptItem = { readonly name: string; readonly quantity: number; readonly unitPrice: number };
type ReceiptPayload = { readonly chequeNumber?: number; readonly restaurantName?: string; readonly hallName?: string; readonly tableName?: string; readonly language?: string; readonly total?: number; readonly items?: readonly ReceiptItem[] };

@Injectable()
export class ChequeAnalyticsService {
  constructor(private readonly prisma: PrismaService, private readonly access: AdminAccessService) {}

  async filters(actor: AdminTokenPayload) {
    await this.access.assert(actor, 'analytics.view');
    const [halls, staff] = await Promise.all([
      this.prisma.hall.findMany({ where: { restaurantId: actor.restaurantId }, select: { id: true, name: true, tables: { where: { isActive: true }, select: { id: true, name: true } } }, orderBy: { sortOrder: 'asc' } }),
      this.prisma.staffMember.findMany({ where: { restaurantId: actor.restaurantId }, select: { id: true, firstName: true, lastName: true }, orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }] }),
    ]);
    return { halls, staff: staff.map((member) => ({ id: member.id, name: `${member.firstName} ${member.lastName}` })) };
  }

  async list(actor: AdminTokenPayload, query: Record<string, string | undefined>) {
    await this.access.assert(actor, 'analytics.view');
    const status = this.status(query.status);
    const where: Prisma.ChequeWhereInput = {
      restaurantId: actor.restaurantId,
      ...(status ? { status } : {}),
      ...(query.ownerId ? { openedByMemberId: query.ownerId } : {}),
      ...(query.tableId ? { tableId: query.tableId } : {}),
      ...(query.hallId ? { table: { hallId: query.hallId } } : {}),
      ...(this.dateRange(query.from, query.to) ? { openedAt: this.dateRange(query.from, query.to) } : {}),
    };
    const settings = await this.prisma.restaurantPosSettings.findUnique({ where: { restaurantId: actor.restaurantId } });
    const cheques = await this.prisma.cheque.findMany({
      where,
      include: {
        openedBy: { select: { firstName: true, lastName: true } },
        table: { include: { hall: { select: { name: true } } } },
        items: { select: { quantity: true, unitPrice: true, status: true } },
        discounts: { select: { amount: true } },
        payments: { select: { method: true, amount: true, receivedAmount: true } },
      },
    });
    const text = query.query?.trim().toLocaleLowerCase() ?? '';
    const paymentFilter = query.payment?.toUpperCase() ?? '';
    const rows = cheques.map((cheque) => this.row(cheque, Number(settings?.serviceChargePercent ?? 0))).filter((row) => {
      const matchesText = !text || `${row.chequeNumber} ${row.owner.name} ${row.hallName} ${row.tableName}`.toLocaleLowerCase().includes(text);
      return matchesText && (!paymentFilter || row.paymentMethod === paymentFilter);
    });
    const sorts = this.sorts(query.sort);
    rows.sort((left, right) => this.compare(left, right, sorts));
    const pageSize = Math.min(100, Math.max(10, Number(query.pageSize) || 25));
    const total = rows.length;
    const pages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(pages, Math.max(1, Number(query.page) || 1));
    return { items: rows.slice((page - 1) * pageSize, page * pageSize), page, pageSize, total, pages };
  }

  async advanceReceipt(actor: AdminTokenPayload, chequeId: string) {
    await this.access.assert(actor, 'analytics.view');
    const cheque = await this.prisma.cheque.findFirst({
      where: { id: chequeId, restaurantId: actor.restaurantId },
      include: {
        restaurant: { include: { translations: true } },
        table: { include: { hall: true } },
        printJobs: { where: { type: 'ADVANCE_CHEQUE' }, orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });
    if (!cheque) throw new NotFoundException('Cheque not found');
    const job = cheque.printJobs[0];
    if (!job) return { available: false, chequeNumber: cheque.sequenceNumber };
    const payload = this.receiptPayload(job.payload);
    const language = payload.language === 'ka' || payload.language === 'ru' ? payload.language : 'en';
    const restaurantName = payload.restaurantName
      ?? cheque.restaurant.translations.find((translation) => translation.languageCode === language)?.name
      ?? cheque.restaurant.translations.find((translation) => translation.languageCode === 'en')?.name
      ?? cheque.restaurant.slug;
    return {
      available: true,
      printedAt: job.createdAt,
      receipt: {
        restaurantName,
        hallName: payload.hallName ?? cheque.table.hall.name,
        tableName: payload.tableName ?? cheque.table.name,
        chequeNumber: payload.chequeNumber ?? cheque.sequenceNumber,
        language,
        total: payload.total ?? Number(cheque.totalAmount ?? 0),
        items: payload.items ?? [],
      },
    };
  }

  private row(cheque: Prisma.ChequeGetPayload<{ include: { openedBy: { select: { firstName: true; lastName: true } }; table: { include: { hall: { select: { name: true } } } }; items: { select: { quantity: true; unitPrice: true; status: true } }; discounts: { select: { amount: true } }; payments: { select: { method: true; amount: true; receivedAmount: true } } } }>, currentServiceFeePercent: number) {
    const subtotal = Number(cheque.subtotalAmount ?? cheque.items.filter((item) => item.status !== 'VOIDED').reduce((sum, item) => sum + Number(item.unitPrice) * item.quantity, 0));
    const serviceFeeAmount = Number(cheque.serviceFeeAmount ?? (subtotal * currentServiceFeePercent / 100).toFixed(2));
    const discountAmount = Number(cheque.discountAmount ?? cheque.discounts.reduce((sum, discount) => sum + Number(discount.amount), 0));
    const grossAmount = Number((subtotal + serviceFeeAmount).toFixed(2));
    const discountPercent = Number(cheque.discountPercent ?? (grossAmount ? (discountAmount / grossAmount * 100).toFixed(2) : 0));
    const totalAmount = Number(cheque.totalAmount ?? Math.max(0, grossAmount - discountAmount).toFixed(2));
    const methods = [...new Set(cheque.payments.map((payment) => payment.method))];
    const paymentMethod = methods.length > 1 ? 'SPLIT' : methods[0] ?? '—';
    const clientPaidAmount = Number(cheque.clientPaidAmount ?? cheque.payments.reduce((sum, payment) => sum + Number(payment.receivedAmount ?? payment.amount), 0));
    return {
      id: cheque.id,
      openedAt: cheque.openedAt,
      chequeNumber: cheque.sequenceNumber,
      owner: { name: `${cheque.openedBy.firstName} ${cheque.openedBy.lastName}` },
      hallName: cheque.table.hall.name,
      tableName: cheque.table.name,
      amountBeforeDiscount: grossAmount,
      discountPercent,
      totalAmount,
      paymentMethod,
      clientPaidAmount,
      closedAt: cheque.closedAt,
      status: cheque.status,
    };
  }

  private status(value: string | undefined): ChequeStatus | undefined {
    if (!value || value === 'ALL') return undefined;
    return Object.values(ChequeStatus).includes(value as ChequeStatus) ? value as ChequeStatus : ChequeStatus.CLOSED;
  }

  private dateRange(from: string | undefined, to: string | undefined): Prisma.DateTimeFilter | undefined {
    const start = from ? new Date(`${from}T00:00:00.000`) : undefined;
    const end = to ? new Date(`${to}T23:59:59.999`) : undefined;
    if (start && Number.isNaN(start.getTime())) return undefined;
    if (end && Number.isNaN(end.getTime())) return undefined;
    return start || end ? { ...(start ? { gte: start } : {}), ...(end ? { lte: end } : {}) } : undefined;
  }

  private sorts(value: string | undefined): readonly SortRule[] {
    const allowed = new Set<SortKey>(['openedAt', 'chequeNumber', 'owner', 'hall', 'table', 'amount', 'discountPercent', 'total', 'payment', 'clientPaid', 'closedAt']);
    const rules = (value ?? 'closedAt:desc').split(',').map((part) => {
      const [key, direction] = part.split(':');
      return allowed.has(key as SortKey) ? { key: key as SortKey, direction: direction === 'asc' ? 'asc' as const : 'desc' as const } : null;
    }).filter((rule): rule is SortRule => rule !== null);
    return rules.length ? rules : [{ key: 'closedAt', direction: 'desc' }];
  }

  private compare(left: ReturnType<ChequeAnalyticsService['row']>, right: ReturnType<ChequeAnalyticsService['row']>, sorts: readonly SortRule[]): number {
    for (const sort of sorts) {
      const values: Record<SortKey, string | number> = {
        openedAt: left.openedAt.getTime(), chequeNumber: left.chequeNumber, owner: left.owner.name, hall: left.hallName, table: left.tableName,
        amount: left.amountBeforeDiscount, discountPercent: left.discountPercent, total: left.totalAmount, payment: left.paymentMethod,
        clientPaid: left.clientPaidAmount, closedAt: left.closedAt?.getTime() ?? 0,
      };
      const rightValues: Record<SortKey, string | number> = {
        openedAt: right.openedAt.getTime(), chequeNumber: right.chequeNumber, owner: right.owner.name, hall: right.hallName, table: right.tableName,
        amount: right.amountBeforeDiscount, discountPercent: right.discountPercent, total: right.totalAmount, payment: right.paymentMethod,
        clientPaid: right.clientPaidAmount, closedAt: right.closedAt?.getTime() ?? 0,
      };
      const result = typeof values[sort.key] === 'string'
        ? String(values[sort.key]).localeCompare(String(rightValues[sort.key]))
        : Number(values[sort.key]) - Number(rightValues[sort.key]);
      if (result) return sort.direction === 'asc' ? result : -result;
    }
    return left.chequeNumber - right.chequeNumber;
  }

  private receiptPayload(value: Prisma.JsonValue): ReceiptPayload {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const source = value as Record<string, unknown>;
    const items = Array.isArray(source['items']) ? source['items'].flatMap((item): ReceiptItem[] => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
      const candidate = item as Record<string, unknown>;
      return typeof candidate['name'] === 'string' && typeof candidate['quantity'] === 'number' && typeof candidate['unitPrice'] === 'number'
        ? [{ name: candidate['name'], quantity: candidate['quantity'], unitPrice: candidate['unitPrice'] }]
        : [];
    }) : undefined;
    return {
      chequeNumber: typeof source['chequeNumber'] === 'number' ? source['chequeNumber'] : undefined,
      restaurantName: typeof source['restaurantName'] === 'string' ? source['restaurantName'] : undefined,
      hallName: typeof source['hallName'] === 'string' ? source['hallName'] : undefined,
      tableName: typeof source['tableName'] === 'string' ? source['tableName'] : undefined,
      language: typeof source['language'] === 'string' ? source['language'] : undefined,
      total: typeof source['total'] === 'number' ? source['total'] : undefined,
      items,
    };
  }
}