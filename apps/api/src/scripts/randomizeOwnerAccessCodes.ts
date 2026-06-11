import { prisma } from "@carshow/db";
import { randomInt } from "node:crypto";

function allocateCode(usedCodes: Set<string>) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const code = randomInt(0, 100_000).toString().padStart(5, "0");
    if (!usedCodes.has(code)) {
      usedCodes.add(code);
      return code;
    }
  }
  throw new Error("Could not allocate a unique owner access code");
}

async function main() {
  const entries = await prisma.vehicleEntry.findMany({
    orderBy: { entryNumber: "asc" },
    select: { id: true, ownerAccessCode: true },
  });
  const usedCodes = new Set(entries.map((entry) => entry.ownerAccessCode));

  await prisma.$transaction(
    entries.map((entry) =>
      prisma.vehicleEntry.update({
        where: { id: entry.id },
        data: { ownerAccessCode: allocateCode(usedCodes) },
      }),
    ),
  );

  const remaining = await prisma.vehicleEntry.findMany({
    select: { entryNumber: true, ownerAccessCode: true },
  });
  const uniqueCodes = new Set(remaining.map((entry) => entry.ownerAccessCode));
  const entryDerived = remaining.filter(
    (entry) => entry.ownerAccessCode === (entry.entryNumber % 100_000).toString().padStart(5, "0"),
  ).length;

  console.log(JSON.stringify({ randomized: entries.length, uniqueCodes: uniqueCodes.size, entryDerived }));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
