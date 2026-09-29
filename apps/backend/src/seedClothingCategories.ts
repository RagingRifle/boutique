import prisma from './config/db.js';

type CategoryNode = { name: string; children?: CategoryNode[] };

const clothingCategories: CategoryNode[] = [
  {
    name: 'Gown',
    children: [
      { name: 'Saree Combination' },
      { name: 'Western Outfits' },
      { name: 'Net Gown' },
    ],
  },
  {
    name: "Men's Wear",
    children: ['Shirt', 'Pant', 'Banarasi', 'Sherwani', 'Kurta', 'Pyjama', 'Coat Suit', 'Blazer'].map(name => ({ name })),
  },
  {
    name: 'Kids Wear',
    children: [
      {
        name: 'Boys',
        children: ['Shirt', 'Pant', 'Banarasi', 'Sherwani', 'Kurta', 'Pyjama', 'Coat Suit', 'Blazer'].map(name => ({ name })),
      },
      {
        name: 'Girls',
        children: [{ name: 'Pavadai Set' }, { name: 'Gown' }],
      },
    ],
  },
  {
    name: 'Family Combo & Customisation',
    children: [{ name: 'Family Combo' }, { name: 'Customisation' }],
  },
  {
    name: 'Blouses',
    children: [
      {
        name: 'Blouse Styles / Cuts',
        children: ['Normal Cut', 'Princess Cut', 'Katori', 'Dart', 'Corset'].map(name => ({ name })),
      },
      {
        name: 'Customisation / Design Options',
        children: ['Neck Shape', 'Sleeve Pattern', 'Pattern Blouse', 'Corset Pattern'].map(name => ({ name })),
      },
      {
        name: 'Additional Add-ons',
        children: [{ name: 'Piping' }, { name: 'Knot' }],
      },
    ],
  },
  {
    name: 'Salwar - Top & Pant Sets',
    children: [
      {
        name: 'Top',
        children: ['Short', 'Long', 'A-line', 'Without Cut', 'Anarkali'].map(name => ({ name })),
      },
      {
        name: 'Pant',
        children: ['Normal Straight Pant', 'Chudidar Pant', 'Gathered Pant', 'Patiala Pant', 'Punjabi Pant', 'Palazzo Pant', 'Umbrella Pant'].map(name => ({ name })),
      },
      {
        name: 'Customisation',
        children: ['Neck Shape', 'Pattern', 'Pant Model'].map(name => ({ name })),
      },
    ],
  },
  { name: 'Lehenga' },
  { name: 'Top & Skirt with Choli' },
  { name: 'Saree' },
];

const slugify = (value: string) => value.toLowerCase()
  .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const placeholderImage = 'https://placehold.co/800x1000/f4f1ec/6b6258?text=Replace+Category+Image';

async function upsertTree(nodes: CategoryNode[], parentId: string | null = null, parentSlug = '') {
  for (const [index, node] of nodes.entries()) {
    const nameSlug = slugify(node.name);
    const slug = parentSlug ? `${parentSlug}-${nameSlug}` : nameSlug;
    const category = await prisma.category.upsert({
      where: { slug },
      create: {
        name: node.name,
        slug,
        parentId,
        order: index + 1,
        imageUrl: placeholderImage,
      },
      update: {
        name: node.name,
        parentId,
        order: index + 1,
      },
    });

    if (node.children?.length) await upsertTree(node.children, category.id, slug);
  }
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL || '';
  if (!databaseUrl.includes('ep-young-violet-b4vfl0q8')) {
    throw new Error('Refusing to seed: DATABASE_URL is not the known Marcos staging Neon project.');
  }
  await upsertTree(clothingCategories);
  console.log('Clothing category tree is ready with placeholder cover images.');
}

main()
  .catch(error => {
    console.error('Clothing category seeding failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
