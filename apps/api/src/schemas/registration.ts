import { z } from "zod";

export const ownerSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  phone: z.string().trim().regex(/^\d{3}-\d{3}-\d{4}$/, "Phone must use XXX-XXX-XXXX format").optional().or(z.literal("")),
  email: z.string().trim().email().max(254).optional().or(z.literal("")),
  publicName: z.string().trim().max(120).optional(),
  publicNameOptIn: z.boolean().default(false),
  waiverAccepted: z.boolean().default(false),
});

export const vehicleSchema = z.object({
  categoryId: z.string().min(1).max(100),
  year: z.coerce.number().int().min(1900).max(2100),
  make: z.string().trim().max(80).optional(),
  model: z.string().trim().max(100).optional(),
  nickname: z.string().trim().max(80).optional(),
  plateNumber: z.string().trim().max(20).optional(),
  exteriorColor: z.string().trim().max(60).optional(),
  internalNotes: z.string().trim().max(1000).optional(),
  buildStory: z.string().trim().max(2500).optional(),
});

export const registrationSchema = z.object({
  owner: ownerSchema,
  vehicle: vehicleSchema,
});
