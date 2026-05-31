import { prisma } from "@carshow/db";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAdmin, requireStaff } from "../auth.js";
import { eventId } from "../config.js";
import { slugify } from "../utils.js";

export async function registerCategoryRoutes(app: FastifyInstance) {
  app.get("/categories", async (request) => {
    await requireStaff(app, request);
    return {
      categories: await prisma.category.findMany({
        where: { eventId },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        include: { _count: { select: { vehicleEntries: true } } },
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
      .parse(request.body);

    const count = await prisma.category.count({ where: { eventId } });
    const category = await prisma.category.create({
      data: {
        eventId,
        name: body.name,
        slug: slugify(body.name),
        active: body.active,
        sortOrder: count + 1,
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
      .parse(request.body);

    const existing = await prisma.category.findFirst({
      where: { id: params.id, eventId },
    });

    if (!existing) throw app.httpErrors.notFound("Category not found");

    const category = await prisma.category.update({
      where: { id: existing.id },
      data: {
        ...body,
        slug: body.name ? slugify(body.name) : undefined,
      },
    });

    return { category };
  });
}

