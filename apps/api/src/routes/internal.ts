import { VehicleStatus, prisma } from "@carshow/db";
import type { FastifyInstance } from "fastify";
import { requireStaff } from "../auth.js";
import { config, eventId } from "../config.js";

export async function registerInternalRoutes(app: FastifyInstance) {
  if (!config.enableDevLogin) return;

  // Returns fixture data (categories, vehicle IDs, QR tokens) needed by the
  // perf test suite. Only active when ENABLE_DEV_LOGIN=true so it is never
  // reachable in production. Also links unassigned QR cards to checked-in
  // vehicles so the QR-token browse and upload paths have real data to hit.
  app.get("/internal/perf-fixtures", async (request) => {
    await requireStaff(app, request);

    const categories = await prisma.category.findMany({
      where: { eventId, active: true },
      select: { slug: true },
      orderBy: { sortOrder: "asc" },
    });
    const slugs = categories.map((c) => c.slug);

    const vehicles = await prisma.vehicleEntry.findMany({
      where: { eventId, status: VehicleStatus.CHECKED_IN },
      select: { id: true, entryNumber: true },
    });
    const vehicleIds = vehicles.map((v) => v.id);
    const entryNumbers = vehicles.map((v) => v.entryNumber);

    const linked = await prisma.qrCard.count({
      where: { vehicleEntryId: { not: null } },
    });

    if (linked < vehicleIds.length) {
      const unlinked = await prisma.qrCard.findMany({
        where: { vehicleEntryId: null },
        select: { id: true },
        take: vehicleIds.length - linked,
      });
      const needed = vehicleIds.slice(linked);
      await Promise.all(
        unlinked.map((card, i) =>
          prisma.qrCard.update({
            where: { id: card.id },
            data: { vehicleEntryId: needed[i] },
          }),
        ),
      );
    }

    const qrCards = await prisma.qrCard.findMany({
      where: { vehicleEntry: { status: VehicleStatus.CHECKED_IN } },
      select: { publicToken: true },
      take: 100,
    });
    const tokens = qrCards.map((q) => q.publicToken);

    return { slugs, vehicleIds, entryNumbers, tokens };
  });
}
