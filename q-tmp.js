
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
(async () => {
  const rows = await prisma.content.findMany({ where: { module: "TOOL", metadata: { path: ["sourceName"], equals: "恩友财务" } }, select: { id: true } });
  const del = await prisma.content.deleteMany({ where: { id: { in: rows.map(r => r.id) } } });
  console.log("恩友 DB 行删除:", del.count);
  const by = await prisma.content.groupBy({ by: ["status"], _count: true, where: { module: "TOOL" } });
  for (const b of by) console.log("TOOL", b.status, b._count);
  await prisma.$disconnect();
})();
