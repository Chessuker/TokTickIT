import { prisma } from './db.js';

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
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
