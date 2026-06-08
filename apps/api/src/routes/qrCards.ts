import { QrCardStatus, VehicleStatus, prisma } from "@carshow/db";
import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requireAdmin, requireStaff } from "../auth.js";
import { eventId } from "../config.js";
import { normalizeQrCode } from "../utils.js";

export async function registerQrCardRoutes(app: FastifyInstance) {
  app.get("/qr-cards", async (request) => {
    await requireStaff(app, request);
    const query = z
      .object({
        status: z.nativeEnum(QrCardStatus).optional(),
      })
      .parse(request.query);

    const qrCards = await prisma.qrCard.findMany({
      where: {
        eventId,
        status: query.status,
      },
      include: {
        vehicleEntry: {
          include: { owner: true, category: true },
        },
      },
      orderBy: { visibleCode: "asc" },
    });

    return { qrCards };
  });

  app.post("/qr-cards/generate", async (request, reply) => {
    await requireAdmin(app, request);
    const body = z.object({ quantity: z.number().int().min(1).max(500) }).parse(request.body);
    const existingCards = await prisma.qrCard.findMany({
      where: { eventId },
      select: { visibleCode: true },
    });
    const highestNumber = existingCards.reduce((highest, card) => {
      const match = /^C-(\d+)$/.exec(card.visibleCode);
      return match ? Math.max(highest, Number(match[1])) : highest;
    }, 0);
    const printedAt = new Date();
    const qrCards = Array.from({ length: body.quantity }, (_, index) => ({
      eventId,
      visibleCode: `C-${(highestNumber + index + 1).toString().padStart(3, "0")}`,
      publicToken: `fd2026-${randomUUID()}`,
      status: QrCardStatus.PRINTED,
      printedAt,
    }));

    await prisma.qrCard.createMany({ data: qrCards });
    return reply.code(201).send({
      created: qrCards.length,
      firstCode: qrCards[0].visibleCode,
      lastCode: qrCards[qrCards.length - 1].visibleCode,
    });
  });

  app.get("/qr-cards/:code", async (request) => {
    await requireStaff(app, request);
    const params = z.object({ code: z.string().trim().min(1) }).parse(request.params);
    const code = normalizeQrCode(params.code);
    const qrCard = await prisma.qrCard.findFirst({
      where: {
        eventId,
        OR: [{ visibleCode: code }, { publicToken: code }],
      },
      include: {
        vehicleEntry: {
          include: { owner: true, category: true },
        },
      },
    });

    if (!qrCard) throw app.httpErrors.notFound("QR card not found");
    return { qrCard };
  });

  app.post("/qr-cards/assign", async (request) => {
    const staff = await requireStaff(app, request);
    const body = z
      .object({
        vehicleEntryId: z.string(),
        code: z.string().trim().min(1),
      })
      .parse(request.body);
    const code = normalizeQrCode(body.code);

    const result = await prisma.$transaction(async (tx) => {
      const vehicle = await tx.vehicleEntry.findFirst({
        where: { id: body.vehicleEntryId, eventId },
        include: { qrCard: true },
      });

      if (!vehicle) throw app.httpErrors.notFound("Registration not found");

      const qrCard = await tx.qrCard.findFirst({
        where: {
          eventId,
          OR: [{ visibleCode: code }, { publicToken: code }],
        },
      });

      if (!qrCard) throw app.httpErrors.notFound("QR card not found");
      if (vehicle.qrCard?.id === qrCard.id) {
        throw app.httpErrors.conflict("Vehicle already has this QR card assigned");
      }
      if (qrCard.status !== QrCardStatus.PRINTED || qrCard.vehicleEntryId) {
        throw app.httpErrors.conflict("QR card is already assigned or unavailable");
      }

      if (vehicle.qrCard) {
        await tx.qrCard.update({
          where: { id: vehicle.qrCard.id },
          data: {
            status: QrCardStatus.REASSIGNED,
            vehicleEntryId: null,
          },
        });

        await tx.qrAssignmentAuditLog.create({
          data: {
            eventId,
            qrCardId: vehicle.qrCard.id,
            vehicleEntryId: vehicle.id,
            staffUserId: staff.id,
            action: "REASSIGNED",
            reason: `Replaced by ${qrCard.visibleCode}`,
          },
        });
      }

      const updatedQrCard = await tx.qrCard.update({
        where: { id: qrCard.id },
        data: {
          status: QrCardStatus.ASSIGNED,
          vehicleEntryId: vehicle.id,
          assignedAt: new Date(),
        },
      });

      const registration = await tx.vehicleEntry.update({
        where: { id: vehicle.id },
        data: {
          status: VehicleStatus.CHECKED_IN,
          checkedInAt: vehicle.checkedInAt ?? new Date(),
        },
        include: { owner: true, category: true, qrCard: true },
      });

      const auditLog = await tx.qrAssignmentAuditLog.create({
        data: {
          eventId,
          qrCardId: qrCard.id,
          vehicleEntryId: vehicle.id,
          staffUserId: staff.id,
          action: vehicle.qrCard ? "REASSIGNED" : "ASSIGNED",
          reason: vehicle.qrCard ? `Replaced ${vehicle.qrCard.visibleCode}` : "Initial registration assignment",
        },
      });

      return { qrCard: updatedQrCard, auditLog, registration };
    });

    return result;
  });

  app.get("/qr-audit", async (request) => {
    await requireStaff(app, request);
    const query = z
      .object({
        vehicleEntryId: z.string().optional(),
        qrCardId: z.string().optional(),
      })
      .parse(request.query);

    const auditLogs = await prisma.qrAssignmentAuditLog.findMany({
      where: {
        eventId,
        vehicleEntryId: query.vehicleEntryId,
        qrCardId: query.qrCardId,
      },
      include: {
        staffUser: true,
        qrCard: true,
        vehicleEntry: {
          include: { owner: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    return { auditLogs };
  });
}
