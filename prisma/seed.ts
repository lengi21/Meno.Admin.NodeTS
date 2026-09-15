import * as argon2 from 'argon2';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const permissions = [
  'settings.view', 'settings.update',
  'staff.view', 'staff.create', 'staff.update', 'staff.delete', 'staff.pin.reset', 'staff.pin.resend',
  'roles.view', 'roles.manage',
  'menus.view', 'menus.manage', 'categories.manage', 'dishes.manage', 'halls.manage',
  'audit.view', 'printers.manage', 'business-day.manage',
  'pos.halls.view', 'pos.cheque.open', 'pos.cheque.modify-unordered', 'pos.order.send',
  'pos.advance-cheque.print', 'pos.cheque.close', 'pos.discount.apply', 'pos.cheque.cancel',
  'pos.day-balance.view', 'pos.day-balance.print', 'pos.printers.use',
];

async function main(): Promise<void> {
  const email = process.env.SEED_OWNER_EMAIL?.toLowerCase();
  const password = process.env.SEED_OWNER_PASSWORD;
  if (!email || !password) throw new Error('SEED_OWNER_EMAIL and SEED_OWNER_PASSWORD are required.');

  const restaurant = await prisma.restaurant.upsert({
    where: { slug: 'panda-house' },
    update: {},
    create: { slug: 'panda-house', translations: { create: [{ languageCode: 'ka', name: 'Panda House' }, { languageCode: 'en', name: 'Panda House' }, { languageCode: 'ru', name: 'Panda House' }] } },
  });
  const qrMenu = await prisma.menu.findFirst({ where: { restaurantId: restaurant.id, code: 'QR_MENU' } });
  if (!qrMenu) {
    const [categories, dishes] = await Promise.all([
      prisma.category.findMany({ where: { restaurantId: restaurant.id, deletedAt: null }, orderBy: { sortOrder: 'asc' } }),
      prisma.dish.findMany({ where: { restaurantId: restaurant.id, deletedAt: null }, orderBy: { sortOrder: 'asc' } }),
    ]);
    await prisma.menu.create({ data: { restaurantId: restaurant.id, code: 'QR_MENU', purpose: 'QR', isSystem: true, translations: { create: [{ languageCode: 'ka', name: 'QR მენიუ' }, { languageCode: 'en', name: 'QR Menu' }, { languageCode: 'ru', name: 'QR меню' }] }, categories: { create: categories.map((category) => ({ categoryId: category.id, sortOrder: category.sortOrder })) }, dishes: { create: dishes.map((dish) => ({ dishId: dish.id, sortOrder: dish.sortOrder })) } } });
  }
  await prisma.restaurantPosSettings.upsert({ where: { restaurantId: restaurant.id }, update: {}, create: { restaurantId: restaurant.id } });

  const permissionRecords = await Promise.all(permissions.map((code) => prisma.permission.upsert({ where: { code }, update: { description: code }, create: { code, description: code } })));
  const ownerRole = await prisma.role.upsert({ where: { restaurantId_name: { restaurantId: restaurant.id, name: 'Owner' } }, update: { isOwnerRole: true }, create: { restaurantId: restaurant.id, name: 'Owner', isOwnerRole: true } });
  await Promise.all(permissionRecords.map((permission) => prisma.rolePermission.upsert({ where: { roleId_permissionId: { roleId: ownerRole.id, permissionId: permission.id } }, update: {}, create: { roleId: ownerRole.id, permissionId: permission.id } })));
  const defaultRoles = [
    { name: 'Manager', description: 'Restaurant operations manager', permissions: ['settings.view', 'halls.manage', 'menus.view', 'menus.manage', 'categories.manage', 'dishes.manage', 'staff.view', 'audit.view', 'printers.manage', 'business-day.manage'] },
    { name: 'Staff', description: 'POS operational access', permissions: ['pos.halls.view', 'pos.cheque.open', 'pos.cheque.modify-unordered', 'pos.order.send', 'pos.advance-cheque.print', 'pos.cheque.close', 'pos.discount.apply', 'pos.cheque.cancel', 'pos.day-balance.view', 'pos.day-balance.print', 'pos.printers.use'] },
  ];
  for (const roleConfig of defaultRoles) {
    const role = await prisma.role.upsert({ where: { restaurantId_name: { restaurantId: restaurant.id, name: roleConfig.name } }, update: { description: roleConfig.description, isActive: true, deletedAt: null }, create: { restaurantId: restaurant.id, name: roleConfig.name, description: roleConfig.description } });
    for (const code of roleConfig.permissions) {
      const permission = permissionRecords.find((item) => item.code === code);
      if (permission) await prisma.rolePermission.upsert({ where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } }, update: {}, create: { roleId: role.id, permissionId: permission.id } });
    }
  }

  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  const owner = await prisma.adminUser.upsert({ where: { restaurantId_email: { restaurantId: restaurant.id, email } }, update: { firstName: 'Panda', lastName: 'House', passwordHash, status: 'ACTIVE', deletedAt: null }, create: { restaurantId: restaurant.id, firstName: 'Panda', lastName: 'House', email, passwordHash } });
  await prisma.adminUserRole.upsert({ where: { adminUserId_roleId: { adminUserId: owner.id, roleId: ownerRole.id } }, update: {}, create: { adminUserId: owner.id, roleId: ownerRole.id } });
  await prisma.adminAuditEvent.create({ data: { restaurantId: restaurant.id, adminUserId: owner.id, action: 'OWNER_SEEDED', entityType: 'AdminUser', entityId: owner.id } });
}

main().then(() => prisma.$disconnect()).catch(async (error) => { console.error(error); await prisma.$disconnect(); process.exit(1); });
