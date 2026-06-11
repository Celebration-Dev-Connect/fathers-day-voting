import { prisma } from "@carshow/db";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAdmin, requireStaff } from "../auth.js";
import { eventId } from "../config.js";
import { slugify } from "../utils.js";

const importRuleSchema = z.object({
  importIdentifier: z.string().trim().toLowerCase().max(100).nullable().optional(),
  importYearMin: z.number().int().min(1900).max(2100).nullable().optional(),
  importYearMax: z.number().int().min(1900).max(2100).nullable().optional(),
});

async function validateImportRule(
  input: { importIdentifier?: string | null; importYearMin?: number | null; importYearMax?: number | null },
  excludeCategoryId?: string,
) {
  const identifier = input.importIdentifier?.trim().toLowerCase() || null;
  const min = input.importYearMin ?? null;
  const max = input.importYearMax ?? null;
  if (!identifier && (min !== null || max !== null)) {
    throw new Error("Choose a CSV identifier before setting a year range.");
  }
  if (min !== null && max !== null && min > max) {
    throw new Error("Minimum year cannot be greater than maximum year.");
  }
  if (!identifier) return;

  const categories = await prisma.category.findMany({
    where: { eventId, importIdentifier: identifier, id: excludeCategoryId ? { not: excludeCategoryId } : undefined },
    select: { name: true, importYearMin: true, importYearMax: true },
  });
  const low = min ?? Number.NEGATIVE_INFINITY;
  const high = max ?? Number.POSITIVE_INFINITY;
  const overlap = categories.find((category) => {
    const categoryLow = category.importYearMin ?? Number.NEGATIVE_INFINITY;
    const categoryHigh = category.importYearMax ?? Number.POSITIVE_INFINITY;
    return low <= categoryHigh && high >= categoryLow;
  });
  if (overlap) throw new Error(`This import rule overlaps with ${overlap.name}.`);
}

async function validateCategorySlug(name: string, excludeCategoryId?: string) {
  const slug = slugify(name);
  if (!slug) throw new Error("Category name must contain at least one letter or number.");

  const existing = await prisma.category.findFirst({
    where: {
      eventId,
      slug,
      id: excludeCategoryId ? { not: excludeCategoryId } : undefined,
    },
    select: { name: true },
  });
  if (existing) {
    throw new Error(`Another category already uses the public URL /browse/${slug}. Choose a different name.`);
  }
}

export async function registerCategoryRoutes(app: FastifyInstance) {
  app.get("/categories", async (request) => {
    await requireStaff(app, request);
    return {
      categories: await prisma.category.findMany({
        where: { eventId },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        include: {
          _count: {
            select: {
              vehicleEntries: true,
              judgeCategoryPicks: true,
              peopleChoiceVotes: true,
              winnerOverrides: true,
            },
          },
        },
      }),
    };
  });

  app.post("/categories", async (request) => {
    await requireAdmin(app, request);
    const body = z
      .object({
        name: z.string().trim().min(1),
        active: z.boolean().default(true),
      })
      .merge(importRuleSchema)
      .parse(request.body);
    try {
      await validateImportRule(body);
      await validateCategorySlug(body.name);
    } catch (error) {
      throw app.httpErrors.badRequest(error instanceof Error ? error.message : "Invalid category");
    }

    const count = await prisma.category.count({ where: { eventId } });
    const category = await prisma.category.create({
      data: {
        eventId,
        name: body.name,
        slug: slugify(body.name),
        active: body.active,
        sortOrder: count + 1,
        importIdentifier: body.importIdentifier || null,
        importYearMin: body.importYearMin,
        importYearMax: body.importYearMax,
      },
    });

    return { category };
  });

  app.patch("/categories/:id", async (request) => {
    await requireAdmin(app, request);
    const params = z.object({ id: z.string() }).parse(request.params);
    const body = z
      .object({
        name: z.string().trim().min(1).optional(),
        active: z.boolean().optional(),
      })
      .merge(importRuleSchema)
      .parse(request.body);

    const existing = await prisma.category.findFirst({
      where: { id: params.id, eventId },
    });

    if (!existing) throw app.httpErrors.notFound("Category not found");
    try {
      await validateImportRule(
        {
          importIdentifier: body.importIdentifier === undefined ? existing.importIdentifier : body.importIdentifier,
          importYearMin: body.importYearMin === undefined ? existing.importYearMin : body.importYearMin,
          importYearMax: body.importYearMax === undefined ? existing.importYearMax : body.importYearMax,
        },
        existing.id,
      );
      if (body.name) await validateCategorySlug(body.name, existing.id);
    } catch (error) {
      throw app.httpErrors.badRequest(error instanceof Error ? error.message : "Invalid category");
    }

    const category = await prisma.category.update({
      where: { id: existing.id },
      data: {
        ...body,
        importIdentifier: body.importIdentifier || body.importIdentifier === null ? body.importIdentifier : undefined,
        slug: body.name ? slugify(body.name) : undefined,
      },
    });

    return { category };
  });

  app.delete("/categories/:id", async (request) => {
    await requireAdmin(app, request);
    const params = z.object({ id: z.string() }).parse(request.params);
    const category = await prisma.category.findFirst({
      where: { id: params.id, eventId },
      include: {
        _count: {
          select: {
            vehicleEntries: true,
            judgeCategoryPicks: true,
            peopleChoiceVotes: true,
            winnerOverrides: true,
          },
        },
      },
    });

    if (!category) throw app.httpErrors.notFound("Category not found");

    const usageCount =
      category._count.vehicleEntries +
      category._count.judgeCategoryPicks +
      category._count.peopleChoiceVotes +
      category._count.winnerOverrides;
    if (usageCount > 0) {
      throw app.httpErrors.conflict("Cannot delete a category that has registrations, votes, or winner data.");
    }

    await prisma.category.delete({ where: { id: category.id } });
    return { ok: true };
  });

  app.get("/special-awards", async (request) => {
    await requireStaff(app, request);
    return {
      specialAwards: await prisma.specialAward.findMany({
        where: { eventId },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        include: { _count: { select: { votes: true } } },
      }),
    };
  });

  app.post("/special-awards", async (request) => {
    await requireAdmin(app, request);
    const body = z
      .object({
        name: z.string().trim().min(1),
        description: z.string().trim().max(500).optional(),
        active: z.boolean().default(true),
      })
      .parse(request.body);

    const count = await prisma.specialAward.count({ where: { eventId } });
    const specialAward = await prisma.specialAward.create({
      data: {
        eventId,
        name: body.name,
        description: body.description,
        active: body.active,
        sortOrder: count + 1,
      },
    });

    return { specialAward };
  });

  app.patch("/special-awards/:id", async (request) => {
    await requireAdmin(app, request);
    const params = z.object({ id: z.string() }).parse(request.params);
    const body = z
      .object({
        name: z.string().trim().min(1).optional(),
        description: z.string().trim().max(500).nullable().optional(),
        active: z.boolean().optional(),
      })
      .parse(request.body);

    const existing = await prisma.specialAward.findFirst({
      where: { id: params.id, eventId },
    });

    if (!existing) throw app.httpErrors.notFound("Special award not found");

    const specialAward = await prisma.specialAward.update({
      where: { id: existing.id },
      data: body,
      include: { _count: { select: { votes: true } } },
    });

    return { specialAward };
  });

  app.delete("/special-awards/:id", async (request) => {
    await requireAdmin(app, request);
    const params = z.object({ id: z.string() }).parse(request.params);
    const specialAward = await prisma.specialAward.findFirst({
      where: { id: params.id, eventId },
      include: { _count: { select: { votes: true } } },
    });

    if (!specialAward) throw app.httpErrors.notFound("Special award not found");
    if (specialAward._count.votes > 0) {
      throw app.httpErrors.conflict("Cannot delete a special award that already has votes.");
    }

    await prisma.specialAward.delete({ where: { id: specialAward.id } });
    return { ok: true };
  });
}
