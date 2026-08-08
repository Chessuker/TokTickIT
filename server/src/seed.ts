import { prisma } from './db.js';

const CATEGORY_NAMES = ['Account and Access', 'Hardware', 'Software', 'Network'];

async function main() {
  // Delete all existing users
  await prisma.user.deleteMany({});

  // Create the single TokTickIT Admin user
  const admin = await prisma.user.create({
    data: {
      email: 'admin@toktickit.xyz',
      name: 'TokTickIT Admin',
    },
  });

  console.log('Successfully reset PostgreSQL database users to single admin:', admin);

  // Seed categories without creating duplicates on repeat runs
  for (const name of CATEGORY_NAMES) {
    await prisma.category.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  console.log('Successfully ensured categories exist:', CATEGORY_NAMES);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
