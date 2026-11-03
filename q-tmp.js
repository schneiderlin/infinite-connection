
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
(async () => {
  const keys = new Set(["tool-9846fa15b749", "tool-bcfde6c1a365", "tool-e77abc91dd08", "tool-0eb7fed8314e", "tool-da3d253281ae", "tool-37c0205b1fb5", "tool-b725fb6ea455", "tool-ac05842c50d6", "tool-8c437cae4c49", "tool-5f88f1a2bb60", "tool-9a52d1f732c1", "tool-d4b917fc42a8", "tool-523b95fc9db4", "tool-c778799bee32", "tool-4189596562c5", "tool-b48ba83555c8", "tool-cc80d4d98923", "tool-882336f4ebc8", "tool-3a0c40526e59", "tool-9eafb90df3ca", "tool-e604c2c17a6b", "tool-44c533e2263d", "tool-1b2e9a70b56f", "tool-7681f18924f8", "tool-9aae8f28ae60", "tool-b591fe019c40", "tool-a5ca3617b764", "tool-3ed1924affd4", "tool-4cac41cff5fa", "tool-60f3f466b3dd", "tool-8a04fefb5b34", "tool-a1722d1ddd00", "tool-bc5098ed6a02", "tool-6ce6fee41041", "tool-2eb73c1910ff", "tool-e60cbae3805b", "tool-673f2a85aa45", "tool-15c5a5f72342", "tool-2d20359b9db2", "tool-909c2fd334e8", "tool-8b1efeb91de8", "tool-24f73fa82443", "tool-67e48e029416", "tool-404b97c0bc8c", "tool-74196f0a1e3c", "tool-e3d68346da03", "tool-61bff335221e", "tool-cc4022800c97", "tool-995074124654", "tool-fd69c1b9a45e", "tool-c6cc18c16b09", "tool-3a78e1df433c", "tool-0591d210837c", "tool-a3f159afa408", "tool-077d170b2784", "tool-962eb5e4a2f8", "tool-8b40a4486f8e", "tool-b856d6909f74", "tool-a1657165cc9d", "tool-234d999c9fd1", "tool-d796b2702742", "tool-a2193bfa3f6a", "tool-f2fc98c5513f", "tool-10bc66247b75", "tool-d5766c5a570b", "tool-aeb4015a9dd3", "tool-8b13cd8dde9f", "tool-5cd6aebd6353", "tool-c7363e3c35ac", "tool-3c7d6f9bddd3", "tool-34e148148ab4", "tool-6db08cfdfef6", "tool-0ed56e9f3a97", "tool-85c8692408dd", "tool-3bf34967bbbb", "tool-393727369249", "tool-257eaf03bbed", "tool-ee9c4e44a0ea", "tool-02a47f28a43a", "tool-d2d8b114412c", "tool-acd2d58896f8", "tool-9775caa29d81", "tool-a3c4a5edeed9", "tool-8efa29fcaaca", "tool-bf69491137a1", "tool-4396f785259f", "tool-206345e4ab8f", "tool-fb2fffac8038", "tool-81836c7b45d7", "tool-7b7839ba9521", "tool-ae41ea84dc35", "tool-a4a4b6f74af0"]);
  const rows = await prisma.content.findMany({
    where: { module: "TOOL", status: "PUBLISHED", metadata: { path: ["sourceKey"], not: "null" } },
    select: { id: true, metadata: true },
  });
  const hit = rows.filter(r => keys.has(String(r.metadata.sourceKey)));
  console.log("匹配到:", hit.length);
  if (hit.length) {
    const r2 = await prisma.content.updateMany({ where: { id: { in: hit.map(h => h.id) } }, data: { status: "UNPUBLISHED" } });
    console.log("已降级:", r2.count);
  }
  const left = await prisma.content.count({ where: { module: "TOOL", status: "PUBLISHED" } });
  console.log("TOOL 仍 PUBLISHED:", left);
  await prisma.$disconnect();
})();
