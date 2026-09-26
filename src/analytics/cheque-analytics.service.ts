import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ChequeStatus, Prisma } from '@prisma/client';
import ExcelJS from 'exceljs';
import type { AdminTokenPayload } from '../auth/auth.types.js';
import { AdminAccessService } from '../admin/admin-access.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

type SortKey = 'openedAt' | 'chequeNumber' | 'owner' | 'hall' | 'table' | 'amount' | 'discountPercent' | 'total' | 'payment' | 'clientPaid' | 'closedAt';
type SortRule = { readonly key: SortKey; readonly direction: 'asc' | 'desc' };
type ReceiptItem = { readonly name: string; readonly quantity: number; readonly unitPrice: number };
type SoldDishRow = { businessDate: string; dishId: string; dishName: string; quantity: number; grossAmount: number; discountAmount: number; serviceFeeAmount: number; totalAmount: number };
type PaymentTotals = { businessDate: string; cash: number; card: number; transfer: number; total: number };
type SalesSummary = { chequeCount: number; subtotal: number; discount: number; serviceFee: number; total: number };

type ReceiptPayload = { readonly chequeNumber?: number; readonly restaurantName?: string; readonly hallName?: string; readonly tableName?: string; readonly language?: string; readonly total?: number; readonly items?: readonly ReceiptItem[] };

@Injectable()
export class ChequeAnalyticsService {
  constructor(private readonly prisma: PrismaService, private readonly access: AdminAccessService) {}

  async filters(actor: AdminTokenPayload) {
    await this.access.assert(actor, 'analytics.view');
    const [halls, staff, businessDays] = await Promise.all([
      this.prisma.hall.findMany({ where: { restaurantId: actor.restaurantId }, select: { id: true, name: true, tables: { where: { isActive: true }, select: { id: true, name: true } } }, orderBy: { sortOrder: 'asc' } }),
      this.prisma.staffMember.findMany({ where: { restaurantId: actor.restaurantId }, select: { id: true, firstName: true, lastName: true }, orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }] }),
      this.prisma.businessDay.findMany({ where: { restaurantId: actor.restaurantId }, select: { id: true, businessDate: true, status: true }, orderBy: { businessDate: 'desc' }, take: 90 }),
    ]);
    const defaultBusinessDayId = businessDays.find((day) => day.status === 'OPEN')?.id ?? businessDays[0]?.id ?? null;
    return { halls, staff: staff.map((member) => ({ id: member.id, name: `${member.firstName} ${member.lastName}` })), businessDays, defaultBusinessDayId };
  }

  async list(actor: AdminTokenPayload, query: Record<string, string | undefined>) {
    await this.access.assert(actor, 'analytics.view');
    const status = this.status(query.status);
    const businessDayId = await this.businessDayId(actor.restaurantId, query.businessDayId);
    const where: Prisma.ChequeWhereInput = {
      restaurantId: actor.restaurantId,
      ...(businessDayId ? { businessDayId } : {}),
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
        restaurant: { include: { translations: true, settings: true } },
        table: { include: { hall: true } },
        printJobs: { where: { type: 'ADVANCE_CHEQUE' }, orderBy: { createdAt: 'desc' }, take: 1 },
        items: { where: { status: { not: 'VOIDED' } }, select: { dishName: true, quantity: true, unitPrice: true } },
        discounts: { select: { amount: true } },
      },
    });
    if (!cheque) throw new NotFoundException('Cheque not found');
    const job = cheque.printJobs[0];
    const payload = job ? this.receiptPayload(job.payload) : {};
    const language = payload.language === 'ka' || payload.language === 'ru' ? payload.language : 'en';
    const restaurantName = payload.restaurantName
      ?? cheque.restaurant.translations.find((translation) => translation.languageCode === language)?.name
      ?? cheque.restaurant.translations.find((translation) => translation.languageCode === 'en')?.name
      ?? cheque.restaurant.slug;
    return {
      available: true,
      printedAt: job?.createdAt ?? cheque.openedAt,
      isLive: !job,
      receipt: {
        restaurantName,
        hallName: payload.hallName ?? cheque.table.hall.name,
        tableName: payload.tableName ?? cheque.table.name,
        chequeNumber: payload.chequeNumber ?? cheque.sequenceNumber,
        language,
        total: payload.total ?? this.liveTotal(cheque, Number(cheque.restaurant.settings?.serviceChargePercent ?? 0)),
        items: payload.items ?? cheque.items.map((item) => ({ name: item.dishName, quantity: item.quantity, unitPrice: Number(item.unitPrice) })),
      },
    };
  }

  /** Closed-cheque sales grouped by the business date and immutable dish snapshot. */
  async soldDishes(actor: AdminTokenPayload, query: Record<string, string | undefined>) {
    await this.access.assert(actor, 'analytics.view');
    const businessDayId = await this.businessDayId(actor.restaurantId, query.businessDayId);
    const range = this.businessDateRange(query.from, query.to);
    const cheques = await this.prisma.cheque.findMany({
      where: {
        restaurantId: actor.restaurantId,
        status: ChequeStatus.CLOSED,
        ...(businessDayId ? { businessDayId } : {}),
        ...(range ? { businessDay: { businessDate: range } } : {}),
      },
      include: {
        businessDay: { select: { businessDate: true } },
        items: { where: { status: { not: 'VOIDED' } }, select: { dishId: true, dishName: true, quantity: true, unitPrice: true } },
        payments: { select: { method: true, amount: true } },
      },
      orderBy: [{ businessDay: { businessDate: 'desc' } }, { closedAt: 'desc' }],
    });
    const rows = new Map<string, SoldDishRow>();
    const payments = new Map<string, PaymentTotals>();
    let summary: SalesSummary = this.emptySummary();
    for (const cheque of cheques) {
      const date = this.dateOnly(cheque.businessDay.businessDate);
      const subtotal = this.money(cheque.subtotalAmount ?? cheque.items.reduce((sum, item) => sum + Number(item.unitPrice) * item.quantity, 0));
      const discount = this.money(cheque.discountAmount ?? 0);
      const serviceFee = this.money(cheque.serviceFeeAmount ?? 0);
      const total = this.money(cheque.totalAmount ?? Math.max(0, subtotal - discount + serviceFee));
      summary = this.addSummary(summary, { subtotal, discount, serviceFee, total, chequeCount: 1 });
      const payment = payments.get(date) ?? this.emptyPaymentTotals(date);
      for (const item of cheque.payments) {
        const amount = this.money(item.amount);
        payment.total = this.money(payment.total + amount);
        if (item.method === 'CASH') payment.cash = this.money(payment.cash + amount);
        if (item.method === 'CARD') payment.card = this.money(payment.card + amount);
        if (item.method === 'TRANSFER') payment.transfer = this.money(payment.transfer + amount);
      }
      payments.set(date, payment);
      if (!subtotal) continue;
      for (const item of cheque.items) {
        const itemSubtotal = this.money(Number(item.unitPrice) * item.quantity);
        const ratio = itemSubtotal / subtotal;
        const itemDiscount = this.money(discount * ratio);
        const itemServiceFee = this.money(serviceFee * ratio);
        const itemTotal = this.money(itemSubtotal - itemDiscount + itemServiceFee);
        const key = `${date}:${item.dishId}`;
        const row = rows.get(key) ?? { businessDate: date, dishId: item.dishId, dishName: item.dishName, quantity: 0, grossAmount: 0, discountAmount: 0, serviceFeeAmount: 0, totalAmount: 0 };
        row.quantity += item.quantity;
        row.grossAmount = this.money(row.grossAmount + itemSubtotal);
        row.discountAmount = this.money(row.discountAmount + itemDiscount);
        row.serviceFeeAmount = this.money(row.serviceFeeAmount + itemServiceFee);
        row.totalAmount = this.money(row.totalAmount + itemTotal);
        rows.set(key, row);
      }
    }
    const vatRate = 18;
    const items = [...rows.values()].map((row) => ({
      ...row,
      unitPrice: row.quantity ? this.money(row.grossAmount / row.quantity) : 0,
      vatRate,
      vatAmount: this.money(row.totalAmount - row.totalAmount / (1 + vatRate / 100)),
      amountExcludingVat: this.money(row.totalAmount / (1 + vatRate / 100)),
    })).sort((a, b) => b.businessDate.localeCompare(a.businessDate) || a.dishName.localeCompare(b.dishName));
    return {
      filters: { businessDayId: businessDayId ?? null, from: query.from ?? null, to: query.to ?? null },
      items,
      payments: [...payments.values()].sort((a, b) => b.businessDate.localeCompare(a.businessDate)),
      summary: { ...summary, vatRate, vatAmount: this.money(summary.total - summary.total / (1 + vatRate / 100)), amountExcludingVat: this.money(summary.total / (1 + vatRate / 100)) },
    };
  }

  async soldDishesWorkbook(actor: AdminTokenPayload, query: Record<string, string | undefined>): Promise<Buffer> {
    const report = await this.soldDishes(actor, query);
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Meno';
    workbook.created = new Date();
    const currencyFormat = '#,##0.00';
    const sales = workbook.addWorksheet('Sold dishes', { views: [{ state: 'frozen', ySplit: 1 }] });
    sales.columns = [
      { header: 'Business date', key: 'businessDate', width: 15 }, { header: 'Meno dish ID', key: 'dishId', width: 28 },
      { header: 'Dish name', key: 'dishName', width: 34 }, { header: 'Quantity', key: 'quantity', width: 12 },
      { header: 'Unit price', key: 'unitPrice', width: 14 }, { header: 'Gross amount (VAT incl.)', key: 'grossAmount', width: 23 },
      { header: 'Discount', key: 'discountAmount', width: 14 }, { header: 'Service fee', key: 'serviceFeeAmount', width: 15 },
      { header: 'Total (VAT incl.)', key: 'totalAmount', width: 20 }, { header: 'VAT rate', key: 'vatRate', width: 11 },
      { header: 'VAT amount', key: 'vatAmount', width: 15 }, { header: 'Total (VAT excl.)', key: 'amountExcludingVat', width: 20 },
    ];
    report.items.forEach((row) => sales.addRow(row));
    this.styleWorkbookSheet(sales, currencyFormat, [5, 6, 7, 8, 9, 11, 12]);
    const paymentSheet = workbook.addWorksheet('Payments by day', { views: [{ state: 'frozen', ySplit: 1 }] });
    paymentSheet.columns = [
      { header: 'Business date', key: 'businessDate', width: 15 }, { header: 'Cash', key: 'cash', width: 15 },
      { header: 'Card', key: 'card', width: 15 }, { header: 'Transfer', key: 'transfer', width: 15 }, { header: 'Total', key: 'total', width: 16 },
    ];
    report.payments.forEach((row) => paymentSheet.addRow(row));
    this.styleWorkbookSheet(paymentSheet, currencyFormat, [2, 3, 4, 5]);
    const summary = workbook.addWorksheet('Summary');
    summary.columns = [{ width: 30 }, { width: 20 }];
    summary.addRows([
      ['Report', 'Sold dishes'], ['Closed cheques', report.summary.chequeCount], ['Gross amount (VAT incl.)', report.summary.subtotal],
      ['Discount', report.summary.discount], ['Service fee', report.summary.serviceFee], ['Total (VAT incl.)', report.summary.total],
      ['VAT rate', `${report.summary.vatRate}%`], ['VAT amount', report.summary.vatAmount], ['Total (VAT excl.)', report.summary.amountExcludingVat],
    ]);
    summary.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    summary.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF667A38' } };
    [3, 4, 5, 6, 8, 9].forEach((index) => summary.getCell(`B${index}`).numFmt = currencyFormat);
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  private styleWorkbookSheet(sheet: ExcelJS.Worksheet, currencyFormat: string, currencyColumns: readonly number[]): void {
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF667A38' } };
    sheet.autoFilter = { from: 'A1', to: `${String.fromCharCode(64 + sheet.columnCount)}1` };
    sheet.eachRow((row, index) => { if (index > 1) currencyColumns.forEach((column) => row.getCell(column).numFmt = currencyFormat); });
  }

  private businessDateRange(from: string | undefined, to: string | undefined): Prisma.DateTimeFilter | undefined {
    const start = from ? new Date(`${from}T00:00:00.000Z`) : undefined;
    const end = to ? new Date(`${to}T23:59:59.999Z`) : undefined;
    if (start && Number.isNaN(start.getTime())) return undefined;
    if (end && Number.isNaN(end.getTime())) return undefined;
    return start || end ? { ...(start ? { gte: start } : {}), ...(end ? { lte: end } : {}) } : undefined;
  }

  private money(value: Prisma.Decimal | number): number { return Number(Number(value).toFixed(2)); }
  private dateOnly(value: Date): string { return value.toISOString().slice(0, 10); }
  private emptyPaymentTotals(businessDate: string): PaymentTotals { return { businessDate, cash: 0, card: 0, transfer: 0, total: 0 }; }
  private emptySummary(): SalesSummary { return { chequeCount: 0, subtotal: 0, discount: 0, serviceFee: 0, total: 0 }; }
  private addSummary(current: SalesSummary, next: SalesSummary): SalesSummary { return { chequeCount: current.chequeCount + next.chequeCount, subtotal: this.money(current.subtotal + next.subtotal), discount: this.money(current.discount + next.discount), serviceFee: this.money(current.serviceFee + next.serviceFee), total: this.money(current.total + next.total) }; }
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

  private async businessDayId(restaurantId: string, requestedId: string | undefined): Promise<string | undefined> {
    if (requestedId === 'all') return undefined;
    if (requestedId) {
      const day = await this.prisma.businessDay.findFirst({ where: { id: requestedId, restaurantId }, select: { id: true } });
      return day?.id;
    }
    const current = await this.prisma.businessDay.findFirst({ where: { restaurantId, status: 'OPEN' }, orderBy: { businessDate: 'desc' }, select: { id: true } });
    if (current) return current.id;
    return (await this.prisma.businessDay.findFirst({ where: { restaurantId }, orderBy: { businessDate: 'desc' }, select: { id: true } }))?.id;
  }

  private liveTotal(cheque: { items: readonly { quantity: number; unitPrice: Prisma.Decimal }[]; discounts: readonly { amount: Prisma.Decimal }[]; totalAmount: Prisma.Decimal | null }, serviceFeePercent: number): number {
    if (cheque.totalAmount) return Number(cheque.totalAmount);
    const subtotal = cheque.items.reduce((sum, item) => sum + Number(item.unitPrice) * item.quantity, 0);
    const discount = cheque.discounts.reduce((sum, item) => sum + Number(item.amount), 0);
    const serviceFee = subtotal * serviceFeePercent / 100;
    return Math.max(0, Number((subtotal + serviceFee - discount).toFixed(2)));
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
    const rules = (value ?? 'openedAt:desc').split(',').map((part) => {
      const [key, direction] = part.split(':');
      return allowed.has(key as SortKey) ? { key: key as SortKey, direction: direction === 'asc' ? 'asc' as const : 'desc' as const } : null;
    }).filter((rule): rule is SortRule => rule !== null);
    return rules.length ? rules : [{ key: 'openedAt', direction: 'desc' }];
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

