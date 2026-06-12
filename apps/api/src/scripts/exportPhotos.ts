import { mkdir, writeFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { prisma } from "@carshow/db";
import { createStorage } from "../media/storage/index.js";

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

function extFor(photo: { contentType: string | null; storageKey: string | null }) {
  if (photo.contentType && MIME_TO_EXT[photo.contentType]) return MIME_TO_EXT[photo.contentType];
  if (photo.storageKey) {
    const ext = extname(photo.storageKey);
    if (ext) return ext;
  }
  return ".jpg";
}

function safeName(value: string) {
  return value.replace(/[^a-zA-Z0-9-]/g, "_").slice(0, 30);
}

async function main() {
  const storage = createStorage();
  const outputDir = resolve(process.cwd(), "output");
  await mkdir(outputDir, { recursive: true });

  const photos = await prisma.vehiclePhoto.findMany({
    where: {
      moderationStatus: "APPROVED",
      storageKey: { not: null },
      vehicleEntry: { event: { id: { not: undefined } } },
    },
    orderBy: [{ vehicleEntry: { entryNumber: "asc" } }, { sortOrder: "asc" }],
    select: {
      id: true,
      storageKey: true,
      contentType: true,
      sortOrder: true,
      vehicleEntry: {
        select: {
          id: true,
          entryNumber: true,
          year: true,
          make: true,
          model: true,
          owner: { select: { firstName: true, lastName: true } },
          category: { select: { name: true } },
        },
      },
    },
  });

  console.log(`Found ${photos.length} approved photos across ${new Set(photos.map((p) => p.vehicleEntry.id)).size} vehicles`);

  const csvRows: string[] = ["entryNumber,year,make,model,category,ownerFirstName,ownerLastName,photoCount,folder"];
  const vehicleSeen = new Map<string, number>();

  for (const photo of photos) {
    const v = photo.vehicleEntry;
    const folderName = `${String(v.entryNumber).padStart(3, "0")}-${v.year}-${safeName(v.make)}-${safeName(v.model)}`;
    const vehicleDir = resolve(outputDir, folderName);
    await mkdir(vehicleDir, { recursive: true });

    const fileIndex = (vehicleSeen.get(v.id) ?? 0) + 1;
    vehicleSeen.set(v.id, fileIndex);

    const filename = `${String(photo.sortOrder).padStart(2, "0")}${extFor(photo)}`;
    process.stdout.write(`  [${v.entryNumber}] ${v.year} ${v.make} ${v.model} — ${filename} ... `);

    const bytes = await storage.getBytes(photo.storageKey!);
    await writeFile(resolve(vehicleDir, filename), bytes);
    console.log("done");

    if (fileIndex === 1) {
      csvRows.push(
        [v.entryNumber, v.year, v.make, v.model, v.category.name, v.owner.firstName, v.owner.lastName, 0, folderName]
          .map(String)
          .join(","),
      );
    }
    // update photo count in last csv row for this vehicle
    const rowIdx = csvRows.findIndex((r) => r.startsWith(`${v.entryNumber},`));
    if (rowIdx !== -1) {
      const parts = csvRows[rowIdx].split(",");
      parts[7] = String(fileIndex);
      csvRows[rowIdx] = parts.join(",");
    }
  }

  await writeFile(resolve(outputDir, "manifest.csv"), csvRows.join("\n") + "\n");
  console.log(`\nDone. Files written to ${outputDir}`);
  console.log(`Manifest: ${resolve(outputDir, "manifest.csv")}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
