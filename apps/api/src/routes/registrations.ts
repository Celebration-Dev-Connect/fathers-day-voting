import { Prisma, QrCardStatus, StaffRole, VehicleStatus, prisma } from "@carshow/db";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireStaff } from "../auth.js";
import { eventId } from "../config.js";
import { registrationSchema } from "../schemas/registration.js";
import { ownerIdentityKey } from "../services/ownerIdentity.js";
import { normalizeSearch } from "../utils.js";

type RegistrationPayload = Prisma.VehicleEntryGetPayload<{
  include: { owner: true; category: true; qrCard: true; photos: true };
}>;

type CsvRegistrationRow = {
  entryNumber: number;
  submittedAt: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  vehicleType: string;
  year: number;
  make: string;
  model: string;
  color: string;
  photoLink: string;
  signature: string;
};

async function nextEntryNumber() {
  const latest = await prisma.vehicleEntry.findFirst({
    where: { eventId },
    orderBy: { entryNumber: "desc" },
    select: { entryNumber: true },
  });

  return (latest?.entryNumber ?? 0) + 1;
}

function accessCodeForEntry(entryNumber: number) {
  return (entryNumber % 100000).toString().padStart(5, "0");
}

function ownerGroupForRow(row: CsvRegistrationRow) {
  return ownerIdentityKey(row.email, row.phone);
}

function selectedOwnerGroup(row: CsvRegistrationRow, assignments: Record<string, string>) {
  const suggested = ownerGroupForRow(row);
  const selected = assignments[String(row.entryNumber)] ?? suggested;
  if (selected !== suggested && selected !== `entry:${row.entryNumber}`) {
    throw new Error(`Entry ${row.entryNumber} has an invalid owner grouping`);
  }
  return selected;
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === "\"") {
      if (quoted && text[index + 1] === "\"") {
        cell += "\"";
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
      continue;
    }
    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    cell += char;
  }

  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

function normalizeCsvHeaders(headers: string[]) {
  return headers.map((header) => header.trim().replace(/\s+/g, " "));
}

function parseRegistrationCsv(text: string) {
  const [rawHeaders, ...rawRows] = parseCsv(text);
  if (!rawHeaders?.length) throw new Error("CSV is empty");
  const headers = normalizeCsvHeaders(rawHeaders);

  function value(record: Record<string, string>, key: string) {
    return record[key]?.trim() ?? "";
  }

  return rawRows.map((columns, index): CsvRegistrationRow => {
    const record = Object.fromEntries(headers.map((header, headerIndex) => [header, columns[headerIndex] ?? ""]));
    const entryNumber = Number(value(record, "Entry"));
    const year = Number(value(record, "Vehicle Year *"));
    if (!Number.isInteger(entryNumber) || entryNumber <= 0) throw new Error(`Row ${index + 2}: Entry must be a number`);
    if (!Number.isInteger(year) || year < 1900 || year > 2100) {
      throw new Error(`Row ${index + 2}: Vehicle Year must be valid`);
    }

    return {
      entryNumber,
      submittedAt: value(record, "Date"),
      firstName: value(record, "First Name *"),
      lastName: value(record, "Last Name *"),
      email: value(record, "Email *"),
      phone: value(record, "Phone *").replace(/\D/g, "").replace(/^(\d{3})(\d{3})(\d{4}).*$/, "$1-$2-$3"),
      vehicleType: value(record, "Vehicle Type *").toLowerCase(),
      year,
      make: value(record, "Make *"),
      model: value(record, "Model *"),
      color: value(record, "Colour *"),
      photoLink: value(record, "Upload Vehicle Photo"),
      signature: value(record, "Electronic Signature *"),
    };
  });
}

type ImportCategory = {
  id: string;
  name: string;
  importIdentifier: string | null;
  importYearMin: number | null;
  importYearMax: number | null;
};

function matchingCategoriesForCsvRow(row: CsvRegistrationRow, categories: ImportCategory[]) {
  return categories.filter((category) => {
    if (!category.importIdentifier || category.importIdentifier !== row.vehicleType) return false;
    if (category.importYearMin !== null && row.year < category.importYearMin) return false;
    if (category.importYearMax !== null && row.year > category.importYearMax) return false;
    return true;
  });
}

function parseCsvOrBadRequest(app: FastifyInstance, csvText: string) {
  let rows: CsvRegistrationRow[];
  try {
    rows = parseRegistrationCsv(csvText.replace(/^\uFEFF/, ""));
  } catch (error) {
    throw app.httpErrors.badRequest(error instanceof Error ? error.message : "Could not parse CSV");
  }
  if (!rows.length) throw app.httpErrors.badRequest("CSV has no registration rows");
  const rowNumbers = new Set<number>();
  for (const row of rows) {
    if (rowNumbers.has(row.entryNumber)) throw app.httpErrors.badRequest(`CSV has duplicate entry ${row.entryNumber}`);
    rowNumbers.add(row.entryNumber);
  }
  return rows;
}

function importNotesForCsvRow(row: CsvRegistrationRow) {
  return [
    `Imported from registration CSV entry ${row.entryNumber}.`,
    row.submittedAt ? `Submitted: ${row.submittedAt}.` : "",
    row.vehicleType ? `CSV vehicle type: ${row.vehicleType}.` : "",
    row.photoLink ? `Original uploaded photo link: ${row.photoLink}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function registrationResponse(registration: RegistrationPayload) {
  const photos = [...registration.photos].sort((a, b) => {
    if (a.id === registration.primaryPhotoId) return -1;
    if (b.id === registration.primaryPhotoId) return 1;
    return a.sortOrder - b.sortOrder;
  });

  return {
    ...registration,
    primaryPhotoId: registration.primaryPhotoId ?? null,
    photos: photos.map((photo) => ({
      id: photo.id,
      vehicleEntryId: photo.vehicleEntryId,
      url: photo.webUrl ?? photo.url ?? null,
      altText: photo.altText,
      sortOrder: photo.sortOrder,
      isPrimary: photo.id === registration.primaryPhotoId,
      ownerUploaded: photo.uploadedBy === `owner:${registration.ownerId}`,
      moderationStatus: photo.moderationStatus,
      createdAt: photo.createdAt.toISOString(),
    })),
  };
}

export async function registerRegistrationRoutes(app: FastifyInstance) {
  app.get("/registrations/metrics", async (request) => {
    await requireStaff(app, request);

    const [total, checkedIn, assignedQr, categories, photosApproved, photosRejected] = await Promise.all([
      prisma.vehicleEntry.count({ where: { eventId } }),
      prisma.vehicleEntry.count({ where: { eventId, status: VehicleStatus.CHECKED_IN } }),
      prisma.qrCard.count({
        where: {
          eventId,
          status: QrCardStatus.ASSIGNED,
          vehicleEntryId: { not: null },
        },
      }),
      prisma.category.count({ where: { eventId, active: true } }),
      prisma.vehiclePhoto.count({ where: { vehicleEntry: { eventId }, moderationStatus: "APPROVED" } }),
      prisma.vehiclePhoto.count({ where: { vehicleEntry: { eventId }, moderationStatus: "REJECTED" } }),
    ]);

    return { metrics: { total, checkedIn, assignedQr, categories, photosApproved, photosRejected } };
  });

  app.get("/registrations", async (request) => {
    await requireStaff(app, request);
    const query = z.object({ search: z.string().optional() }).parse(request.query);
    const search = normalizeSearch(query.search);
    const numericSearch = Number(search.replace(/^#/, ""));

    const searchFilters: Prisma.VehicleEntryWhereInput[] | undefined = search
      ? [
          ...(Number.isFinite(numericSearch) ? [{ entryNumber: numericSearch }] : []),
          { make: { contains: search, mode: "insensitive" } },
          { model: { contains: search, mode: "insensitive" } },
          { plateNumber: { contains: search, mode: "insensitive" } },
          { owner: { firstName: { contains: search, mode: "insensitive" } } },
          { owner: { lastName: { contains: search, mode: "insensitive" } } },
          { owner: { phone: { contains: search, mode: "insensitive" } } },
          { owner: { email: { contains: search, mode: "insensitive" } } },
          { ownerAccessCode: { contains: search } },
          { qrCard: { visibleCode: { contains: search, mode: "insensitive" } } },
          { qrCard: { publicToken: { contains: search, mode: "insensitive" } } },
        ]
      : undefined;

    const registrations = await prisma.vehicleEntry.findMany({
      where: {
        eventId,
        ...(searchFilters ? { OR: searchFilters } : {}),
      },
      orderBy: { entryNumber: "desc" },
      include: {
        owner: true,
        category: true,
        qrCard: true,
        photos: { orderBy: { sortOrder: "asc" } },
      },
      take: 100,
    });

    return { registrations: registrations.map(registrationResponse) };
  });

  app.get("/owners", async (request) => {
    await requireStaff(app, request);
    const query = z.object({ search: z.string().optional() }).parse(request.query);
    const search = normalizeSearch(query.search);
    const owners = await prisma.owner.findMany({
      where: {
        vehicleEntries: { some: { eventId } },
        ...(search
          ? {
              OR: [
                { firstName: { contains: search, mode: "insensitive" } },
                { lastName: { contains: search, mode: "insensitive" } },
                { phone: { contains: search, mode: "insensitive" } },
                { email: { contains: search, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      include: {
        vehicleEntries: {
          where: { eventId },
          orderBy: { entryNumber: "asc" },
          select: { id: true, entryNumber: true, year: true, make: true, model: true },
        },
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      take: 25,
    });

    return { owners };
  });

  app.post("/registrations", async (request) => {
    const staff = await requireStaff(app, request);
    const body = registrationSchema.extend({ ownerId: z.string().trim().min(1).optional() }).parse(request.body);

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { registrationOpen: true },
    });

    if (!event) throw app.httpErrors.notFound("Event not found");
    if (!event.registrationOpen && staff.role !== StaffRole.ADMIN) {
      throw app.httpErrors.forbidden("Registration is closed");
    }

    const category = await prisma.category.findFirst({
      where: { id: body.vehicle.categoryId, eventId, active: true },
    });

    if (!category) {
      throw app.httpErrors.badRequest("Active category is required");
    }

    const entryNumber = await nextEntryNumber();
    const registration = await prisma.$transaction(async (tx) => {
      const owner = body.ownerId
        ? await tx.owner.findFirst({ where: { id: body.ownerId, vehicleEntries: { some: { eventId } } } })
        : await tx.owner.create({
            data: {
              ...body.owner,
              email: body.owner.email || null,
            },
          });
      if (!owner) throw app.httpErrors.badRequest("Selected owner was not found");

      return tx.vehicleEntry.create({
        data: {
          eventId,
          ownerId: owner.id,
          categoryId: body.vehicle.categoryId,
          entryNumber,
          ownerAccessCode: accessCodeForEntry(entryNumber),
          year: body.vehicle.year,
          make: body.vehicle.make,
          model: body.vehicle.model,
          nickname: body.vehicle.nickname,
          plateNumber: body.vehicle.plateNumber,
          exteriorColor: body.vehicle.exteriorColor,
          internalNotes: body.vehicle.internalNotes,
          buildStory: body.vehicle.buildStory,
          registeredByStaffId: staff.id,
        },
        include: {
          owner: true,
          category: true,
          qrCard: true,
          photos: { orderBy: { sortOrder: "asc" } },
        },
      });
    });

    return { registration: registrationResponse(registration) };
  });

  app.post("/registrations/import-csv/preview", async (request) => {
    const staff = await requireStaff(app, request);
    if (staff.role !== StaffRole.ADMIN) throw app.httpErrors.forbidden("Only admins can import registrations");
    const body = z.object({ csvText: z.string().min(1) }).parse(request.body);
    const rows = parseCsvOrBadRequest(app, body.csvText);
    const categories = await prisma.category.findMany({
      where: { eventId },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    const ownerGroupSizes = new Map<string, number>();
    for (const row of rows) {
      const key = ownerGroupForRow(row);
      ownerGroupSizes.set(key, (ownerGroupSizes.get(key) ?? 0) + 1);
    }
    const existingOwners = await prisma.owner.findMany({
      where: { vehicleEntries: { some: { eventId } } },
      include: {
        vehicleEntries: {
          where: { eventId },
          select: { id: true },
        },
      },
    });
    const existingOwnerByGroup = new Map(
      existingOwners.map((owner) => [ownerIdentityKey(owner.email ?? "", owner.phone), owner]),
    );

    return {
      rows: rows.map((row) => {
        const matches = matchingCategoriesForCsvRow(row, categories);
        const suggestedOwnerGroup = ownerGroupForRow(row);
        const existingOwner = existingOwnerByGroup.get(suggestedOwnerGroup);
        return {
          entryNumber: row.entryNumber,
          ownerName: `${row.firstName} ${row.lastName}`.trim(),
          ownerEmail: row.email,
          ownerPhone: row.phone,
          suggestedOwnerGroup,
          suggestedOwnerGroupSize: ownerGroupSizes.get(suggestedOwnerGroup) ?? 1,
          existingOwner: existingOwner
            ? {
                id: existingOwner.id,
                name: `${existingOwner.firstName} ${existingOwner.lastName}`.trim(),
                vehicleCount: existingOwner.vehicleEntries.length,
              }
            : null,
          vehicleType: row.vehicleType,
          year: row.year,
          vehicleName: `${row.year} ${row.make} ${row.model}`.trim(),
          matchedCategoryIds: matches.map((category) => category.id),
          status: matches.length === 1 ? "MATCHED" : matches.length === 0 ? "UNMATCHED" : "CONFLICT",
        };
      }),
    };
  });

  app.post("/registrations/import-csv", async (request, reply) => {
    const staff = await requireStaff(app, request);
    if (staff.role !== StaffRole.ADMIN) throw app.httpErrors.forbidden("Only admins can import registrations");
    const body = z
      .object({
        csvText: z.string().min(1),
        categoryAssignments: z.record(z.string(), z.string()),
        ownerGroupAssignments: z.record(z.string(), z.string()).default({}),
      })
      .parse(request.body);
    const rows = parseCsvOrBadRequest(app, body.csvText);

    const categories = await prisma.category.findMany({ where: { eventId } });
    const categoryById = new Map(categories.map((category) => [category.id, category]));
    if (!categories.length) throw app.httpErrors.badRequest("Create at least one category before importing");

    const seedVehicleCount = await prisma.vehicleEntry.count({
      where: { eventId, id: { startsWith: "seed-vehicle-" } },
    });
    for (const row of rows) {
      const category = categoryById.get(body.categoryAssignments[String(row.entryNumber)]);
      if (!category) throw app.httpErrors.badRequest(`Choose a category for entry ${row.entryNumber}`);
      registrationSchema.parse({
        owner: {
          firstName: row.firstName,
          lastName: row.lastName,
          phone: row.phone,
          email: row.email,
          publicName: `${row.firstName} ${row.lastName}`.trim(),
          publicNameOptIn: true,
          waiverAccepted: Boolean(row.signature),
        },
        vehicle: {
          categoryId: category.id,
          year: row.year,
          make: row.make,
          model: row.model,
          exteriorColor: row.color,
          internalNotes: importNotesForCsvRow(row),
        },
      });
      try {
        selectedOwnerGroup(row, body.ownerGroupAssignments);
      } catch (error) {
        throw app.httpErrors.badRequest(error instanceof Error ? error.message : "Invalid owner grouping");
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      if (seedVehicleCount > 0) {
        await tx.vehicleEntry.deleteMany({ where: { eventId, id: { startsWith: "seed-vehicle-" } } });
        await tx.owner.deleteMany({ where: { id: { startsWith: "seed-owner-" }, vehicleEntries: { none: {} } } });
      }

      let created = 0;
      let updated = 0;
      const previousOwnerIds = new Set<string>();
      const existingOwners = await tx.owner.findMany({
        where: { vehicleEntries: { some: { eventId } } },
      });
      const existingOwnerByGroup = new Map(
        existingOwners.map((owner) => [ownerIdentityKey(owner.email ?? "", owner.phone), owner]),
      );
      const rowsByOwnerGroup = new Map<string, CsvRegistrationRow[]>();
      for (const row of rows) {
        const group = selectedOwnerGroup(row, body.ownerGroupAssignments);
        rowsByOwnerGroup.set(group, [...(rowsByOwnerGroup.get(group) ?? []), row]);
      }

      for (const [group, ownerRows] of rowsByOwnerGroup) {
        const firstRow = ownerRows[0];
        const existingEntries = await tx.vehicleEntry.findMany({
          where: { eventId, entryNumber: { in: ownerRows.map((row) => row.entryNumber) } },
          select: { id: true, entryNumber: true, ownerId: true },
        });
        existingEntries.forEach((entry) => previousOwnerIds.add(entry.ownerId));
        const existingByEntry = new Map(existingEntries.map((entry) => [entry.entryNumber, entry]));
        const existingEntryOwner = existingEntries[0]
          ? await tx.owner.findUnique({
              where: { id: existingEntries[0].ownerId },
              include: { vehicleEntries: { where: { eventId }, select: { id: true } } },
            })
          : null;
        const ownerData = {
          firstName: firstRow.firstName,
          lastName: firstRow.lastName,
          phone: firstRow.phone,
          email: firstRow.email || null,
          publicName: `${firstRow.firstName} ${firstRow.lastName}`.trim(),
          publicNameOptIn: true,
          waiverAccepted: ownerRows.some((row) => Boolean(row.signature)),
        };
        const existingEntryOwnerMatches =
          existingEntryOwner &&
          ownerIdentityKey(existingEntryOwner.email ?? "", existingEntryOwner.phone) === ownerGroupForRow(firstRow);
        const existingGroupOwner = group.startsWith("entry:")
          ? existingEntryOwnerMatches && existingEntryOwner.vehicleEntries.length === 1
            ? existingEntryOwner
            : null
          : existingEntryOwnerMatches
            ? existingEntryOwner
            : existingOwnerByGroup.get(ownerGroupForRow(firstRow)) ?? null;
        const owner = existingGroupOwner
          ? await tx.owner.update({ where: { id: existingGroupOwner.id }, data: ownerData })
          : await tx.owner.create({ data: ownerData });

        for (const row of ownerRows) {
          const category = categoryById.get(body.categoryAssignments[String(row.entryNumber)]);
          if (!category) throw app.httpErrors.badRequest(`Choose a category for entry ${row.entryNumber}`);
          const existing = existingByEntry.get(row.entryNumber);
          const vehicleData = {
            ownerId: owner.id,
            categoryId: category.id,
            entryNumber: row.entryNumber,
            year: row.year,
            make: row.make,
            model: row.model,
            exteriorColor: row.color,
            internalNotes: importNotesForCsvRow(row),
            ownerAccessCode: accessCodeForEntry(row.entryNumber),
            source: "ONLINE_IMPORT" as const,
            registeredByStaffId: staff.id,
          };

          if (existing) {
            await tx.vehicleEntry.update({ where: { id: existing.id }, data: vehicleData });
            updated += 1;
          } else {
            await tx.vehicleEntry.create({
              data: {
                eventId,
                ...vehicleData,
              },
            });
            created += 1;
          }
        }
      }

      for (const ownerId of previousOwnerIds) {
        const remainingVehicles = await tx.vehicleEntry.count({ where: { ownerId } });
        if (remainingVehicles === 0) await tx.owner.delete({ where: { id: ownerId } });
      }

      return { created, updated, replacedSeeded: seedVehicleCount };
    });

    return reply.code(202).send({
      ...result,
      imported: rows.length,
      message:
        result.replacedSeeded > 0
          ? `Imported ${rows.length} registrations and removed ${result.replacedSeeded} seeded demo vehicles.`
          : `Imported ${rows.length} registrations.`,
    });
  });

  app.get("/registrations/:id", async (request) => {
    await requireStaff(app, request);
    const params = z.object({ id: z.string() }).parse(request.params);
    const registration = await prisma.vehicleEntry.findFirst({
      where: { id: params.id, eventId },
      include: {
        owner: true,
        category: true,
        qrCard: true,
        photos: { orderBy: { sortOrder: "asc" } },
        qrAuditLogs: {
          include: { staffUser: true, qrCard: true },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!registration) throw app.httpErrors.notFound("Registration not found");
    return { registration: registrationResponse(registration) };
  });

  app.patch("/registrations/:id", async (request) => {
    await requireStaff(app, request);
    const params = z.object({ id: z.string() }).parse(request.params);
    const body = registrationSchema.partial().parse(request.body);

    const existing = await prisma.vehicleEntry.findFirst({
      where: { id: params.id, eventId },
      include: { owner: true },
    });

    if (!existing) throw app.httpErrors.notFound("Registration not found");

    const registration = await prisma.$transaction(async (tx) => {
      if (body.owner) {
        await tx.owner.update({
          where: { id: existing.ownerId },
          data: {
            ...body.owner,
            email: body.owner.email || null,
          },
        });
      }

      return tx.vehicleEntry.update({
        where: { id: existing.id },
        data: body.vehicle
          ? {
              categoryId: body.vehicle.categoryId,
              year: body.vehicle.year,
              make: body.vehicle.make,
              model: body.vehicle.model,
              nickname: body.vehicle.nickname,
              plateNumber: body.vehicle.plateNumber,
              exteriorColor: body.vehicle.exteriorColor,
              internalNotes: body.vehicle.internalNotes,
              buildStory: body.vehicle.buildStory,
            }
          : {},
        include: { owner: true, category: true, qrCard: true, photos: { orderBy: { sortOrder: "asc" } } },
      });
    });

    return { registration: registrationResponse(registration) };
  });

  app.patch("/registrations/:id/primary-photo", async (request) => {
    await requireStaff(app, request);
    const params = z.object({ id: z.string() }).parse(request.params);
    const body = z.object({ photoId: z.string().trim().min(1) }).parse(request.body);
    const existing = await prisma.vehicleEntry.findFirst({
      where: { id: params.id, eventId },
      select: { id: true },
    });
    if (!existing) throw app.httpErrors.notFound("Registration not found");

    const photo = await prisma.vehiclePhoto.findFirst({
      where: {
        id: body.photoId,
        vehicleEntryId: existing.id,
        moderationStatus: "APPROVED",
        url: { not: null },
      },
      select: { id: true },
    });
    if (!photo) throw app.httpErrors.badRequest("Only approved photos can be set as hero");

    const registration = await prisma.vehicleEntry.update({
      where: { id: existing.id },
      data: { primaryPhotoId: photo.id },
      include: { owner: true, category: true, qrCard: true, photos: { orderBy: { sortOrder: "asc" } } },
    });

    return { registration: registrationResponse(registration) };
  });

  app.post("/registrations/:id/check-in", async (request) => {
    await requireStaff(app, request);
    const params = z.object({ id: z.string() }).parse(request.params);
    const existing = await prisma.vehicleEntry.findFirst({
      where: { id: params.id, eventId },
    });

    if (!existing) throw app.httpErrors.notFound("Registration not found");

    const registration = await prisma.vehicleEntry.update({
      where: { id: existing.id },
      data: {
        status: VehicleStatus.CHECKED_IN,
        checkedInAt: new Date(),
      },
      include: { owner: true, category: true, qrCard: true, photos: { orderBy: { sortOrder: "asc" } } },
    });

    return { registration: registrationResponse(registration) };
  });
}
