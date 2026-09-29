import prisma from './config/db.js';
import { hashPassword } from './utils/crypto.js';
import { resolveSelectedCustomizations, type CustomizationGroup } from './utils/customizations.js';

const placeholder = (label: string) => `https://placehold.co/800x1000/f4f1ec/6b6258?text=${encodeURIComponent(label)}`;
const password = 'MarcosDemo123!';
const demoMarker = '[STAGING DEMO DATA]';

const products = [
  { name: 'Rose Gold Net Gown', slug: 'gown-net-gown', price: 6490, category: 'gown-net-gown', gender: 'WOMEN' as const, description: 'Demo party gown in rose gold net with placeholder photography.' },
  { name: 'Emerald Banarasi Saree', slug: 'saree', price: 8290, category: 'saree', gender: 'WOMEN' as const, description: 'Demo emerald Banarasi saree with placeholder photography.' },
  { name: 'Ivory Princess Cut Blouse', slug: 'blouses-blouse-styles-cuts-princess-cut', price: 1890, category: 'blouses-blouse-styles-cuts-princess-cut', gender: 'WOMEN' as const, description: 'Demo made-to-measure blouse; choose optional finishing add-ons.' },
  { name: 'Maroon Anarkali Salwar Set', slug: 'salwar-top-pant-sets-top-anarkali', price: 4590, category: 'salwar-top-pant-sets-top-anarkali', gender: 'WOMEN' as const, description: 'Demo Anarkali top and pant set with placeholder photography.' },
  { name: 'Floral Pavadai Set', slug: 'kids-wear-girls-pavadai-set', price: 2790, category: 'kids-wear-girls-pavadai-set', gender: 'KIDS' as const, description: 'Demo girls’ festive pavadai set with placeholder photography.' },
  { name: 'Festive Family Combo', slug: 'family-combo-customisation-family-combo', price: 12990, category: 'family-combo-customisation-family-combo', gender: 'UNISEX' as const, description: 'Demo family outfit package; details can be customized with the store.' },
];

const blouseGroups: CustomizationGroup[] = [
  { id: 'demo-blouse-cut', name: 'Blouse cut', selectionType: 'SINGLE', required: true, options: [
    { id: 'demo-princess-cut', name: 'Princess cut', price: 250 },
    { id: 'demo-katori-cut', name: 'Katori', price: 350 },
    { id: 'demo-corset-cut', name: 'Corset style', price: 600 },
  ] },
  { id: 'demo-blouse-finishing', name: 'Finishing add-ons', selectionType: 'MULTIPLE', required: false, options: [
    { id: 'demo-piping', name: 'Piping', price: 150 },
    { id: 'demo-knot', name: 'Back knot', price: 100 },
  ] },
];

async function main() {
  const databaseUrl = process.env.DATABASE_URL || '';
  if (!databaseUrl.includes('ep-young-violet-b4vfl0q8')) {
    throw new Error('Refusing to seed: DATABASE_URL is not the known Marcos staging Neon project.');
  }

  const blouseCategory = await prisma.category.findUnique({ where: { slug: 'blouses' } });
  if (!blouseCategory) throw new Error('Run seed:clothing-categories before this script.');
  await prisma.category.update({ where: { id: blouseCategory.id }, data: { customizationGroups: blouseGroups } });

  const seededProducts = new Map<string, { id: string; name: string; price: number }>();
  for (const item of products) {
    const category = await prisma.category.findUnique({ where: { slug: item.category } });
    if (!category) throw new Error(`Missing category ${item.category}; run seed:clothing-categories first.`);
    const existing = await prisma.product.findFirst({ where: { name: item.name, categoryId: category.id } });
    const data = {
      name: item.name,
      description: `${item.description} ${demoMarker}`,
      price: item.price,
      images: [placeholder(item.name)],
      bannerImage: placeholder(item.name),
      categoryId: category.id,
      inventoryQty: 12,
      stockStatus: 'IN_STOCK' as const,
      targetGender: item.gender,
      isTrending: false,
      inheritCategoryCustomizations: true,
    };
    const product = existing
      ? await prisma.product.update({ where: { id: existing.id }, data })
      : await prisma.product.create({ data });
    seededProducts.set(item.slug, { id: product.id, name: product.name, price: Number(product.price) });
  }

  const passwordHash = await hashPassword(password);
  const demoCustomers = [
    { email: 'demo.asha@marcos.test', phoneNumber: '+919876500101', fullName: 'Asha Demo Customer', referralCode: 'DEMO-ASHA-2026' },
    { email: 'demo.ravi@marcos.test', phoneNumber: '+919876500102', fullName: 'Ravi Demo Customer', referralCode: 'DEMO-RAVI-2026' },
  ];
  const users = [];
  for (const customer of demoCustomers) {
    users.push(await prisma.user.upsert({
      where: { email: customer.email },
      create: { ...customer, role: 'CUSTOMER', passwordHash, passwordSetByUser: true, gender: 'Prefer not to say', address: 'Demo address, staging only' },
      update: { ...customer, role: 'CUSTOMER', passwordHash, passwordSetByUser: true, address: 'Demo address, staging only' },
    }));
  }

  const demoOrders = await prisma.order.findMany({ where: { invoiceNumber: { startsWith: 'DEMO-' } }, select: { id: true } });
  if (demoOrders.length) await prisma.appointment.deleteMany({ where: { orderId: { in: demoOrders.map(order => order.id) } } });
  await prisma.appointment.deleteMany({ where: { notes: { contains: demoMarker } } });
  await prisma.order.deleteMany({ where: { invoiceNumber: { startsWith: 'DEMO-' } } });

  const orderPlan = [
    { userIndex: 0, productSlug: 'gown-net-gown', status: 'PROCESSING' as const, paymentStatus: 'PARTIAL' as const, amountPaid: 2000, suffix: 'ASHA-01', choices: [] },
    { userIndex: 0, productSlug: 'blouses-blouse-styles-cuts-princess-cut', status: 'PENDING' as const, paymentStatus: 'PENDING' as const, amountPaid: 0, suffix: 'ASHA-02', choices: [
      { groupId: 'demo-blouse-cut', optionIds: ['demo-princess-cut'] },
      { groupId: 'demo-blouse-finishing', optionIds: ['demo-piping', 'demo-knot'] },
    ] },
    { userIndex: 1, productSlug: 'salwar-top-pant-sets-top-anarkali', status: 'PAID' as const, paymentStatus: 'COMPLETED' as const, amountPaid: 4590, suffix: 'RAVI-01', choices: [] },
    { userIndex: 1, productSlug: 'saree', status: 'PENDING' as const, paymentStatus: 'PENDING' as const, amountPaid: 0, suffix: 'RAVI-02', choices: [] },
  ];

  for (const [index, plan] of orderPlan.entries()) {
    const product = seededProducts.get(plan.productSlug);
    if (!product) throw new Error(`Missing demo product ${plan.productSlug}`);
    const groups = plan.productSlug === 'blouses-blouse-styles-cuts-princess-cut' ? blouseGroups : [];
    const resolved = resolveSelectedCustomizations(groups, plan.choices);
    const total = product.price + resolved.priceAdjustment;
    const order = await prisma.order.create({ data: {
      userId: users[plan.userIndex].id,
      status: plan.status,
      totalAmount: total,
      taxAmount: 0,
      gstPercentage: 0,
      payableAmount: total,
      paymentMethod: 'DEMO - no payment collected',
      invoiceNumber: `DEMO-${plan.suffix}`,
      paymentStatus: plan.paymentStatus,
      advancePayment: plan.amountPaid,
      balanceAmount: total - plan.amountPaid,
      customizations: demoMarker,
      orderItems: { create: { productId: product.id, quantity: 1, price: product.price, selectedCustomizations: resolved.selectedCustomizations } },
    } });

    if (index === 0 || index === 2) {
      const daysAhead = index === 0 ? 4 : 6;
      const appointmentDate = new Date();
      appointmentDate.setDate(appointmentDate.getDate() + daysAhead);
      appointmentDate.setHours(11 + index, 0, 0, 0);
      await prisma.appointment.create({ data: {
        userId: users[plan.userIndex].id,
        orderId: order.id,
        date: appointmentDate,
        timeSlot: index === 0 ? '11:00 AM - 12:00 PM' : '1:00 PM - 2:00 PM',
        productType: product.name,
        type: index === 0 ? 'MEASUREMENT' : 'CONSULTATION',
        status: index === 0 ? 'CONFIRMED' : 'PENDING',
        notes: `${demoMarker} Please treat this as a sample appointment.`,
      } });
    }
  }

  console.log('Staging demo catalog, customer logins, sample orders, and appointments are ready.');
  console.log(`Demo login password for both customers: ${password}`);
}

main()
  .catch(error => {
    console.error('Staging demo seeding failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => { await prisma.$disconnect(); });
