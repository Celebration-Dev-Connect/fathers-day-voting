import { z } from "zod";

export const ownerSchema = z.object({
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
  phone: z.string().trim().regex(/^\d{3}-\d{3}-\d{4}$/, "Phone must use XXX-XXX-XXXX format"),
  email: z.string().trim().email().optional().or(z.literal("")),
  publicName: z.string().trim().optional(),
  publicNameOptIn: z.boolean().default(false),
  waiverAccepted: z.boolean().default(false),
});

export const vehicleSchema = z.object({
  categoryId: z.string().min(1),
  year: z.coerce.number().int().min(1900).max(2100),
  make: z.string().trim().min(1),
  model: z.string().trim().min(1),
  nickname: z.string().trim().optional(),
  plateNumber: z.string().trim().optional(),
  exteriorColor: z.string().trim().optional(),
  internalNotes: z.string().trim().optional(),
  buildStory: z.string().trim().max(2500).optional(),
});

export const registrationSchema = z.object({
  owner: ownerSchema,
  vehicle: vehicleSchema,
});
