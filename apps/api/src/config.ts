import { resolve } from "node:path";
import { z } from "zod";

export const eventId = "event-2026-fathers-day";

const isProduction = process.env.NODE_ENV === "production";

const storageDriverSchema = z.enum(["local", "s3"]);
const moderationDriverSchema = z.enum(["mock", "rekognition"]);

const envSchema = z
  .object({
    nodeEnv: z.string().default("development"),
    port: z.coerce.number().int().positive().default(4000),
    host: z.string().default("0.0.0.0"),
    // In production a real secret is mandatory; in dev we fall back.
    jwtSecret: z.string().min(1).default(isProduction ? "" : "local-dev-secret-change-me"),

    storageDriver: storageDriverSchema.default("local"),
    moderationDriver: moderationDriverSchema.default("mock"),

    // Local filesystem driver
    localStorageDir: z.string().default("var/media"),
    mediaPublicBaseUrl: z.string().default("http://localhost:4000"),

    // S3 / Rekognition drivers
    awsRegion: z.string().optional(),
    s3Bucket: z.string().optional(),
    cdnBaseUrl: z.string().optional(),
    moderationMinConfidence: z.coerce.number().min(0).max(100).default(60),

    // Common upload limits
    photoMaxBytes: z.coerce.number().int().positive().default(5 * 1024 * 1024),
    photoPerVehicleCap: z.coerce.number().int().positive().default(10),
  })
  .superRefine((value, ctx) => {
    if (isProduction && !value.jwtSecret) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["jwtSecret"], message: "JWT_SECRET is required in production" });
    }
    if (value.storageDriver === "s3") {
      for (const key of ["awsRegion", "s3Bucket", "cdnBaseUrl"] as const) {
        if (!value[key]) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: [key], message: `${key} is required when STORAGE_DRIVER=s3` });
        }
      }
    }
    if (value.moderationDriver === "rekognition" && !value.awsRegion) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["awsRegion"], message: "AWS_REGION is required when MODERATION_DRIVER=rekognition" });
    }
  });

const parsed = envSchema.safeParse({
  nodeEnv: process.env.NODE_ENV,
  port: process.env.API_PORT,
  host: process.env.API_HOST,
  jwtSecret: process.env.JWT_SECRET,
  storageDriver: process.env.STORAGE_DRIVER,
  moderationDriver: process.env.MODERATION_DRIVER,
  localStorageDir: process.env.LOCAL_STORAGE_DIR,
  mediaPublicBaseUrl: process.env.MEDIA_PUBLIC_BASE_URL,
  awsRegion: process.env.AWS_REGION,
  s3Bucket: process.env.S3_BUCKET,
  cdnBaseUrl: process.env.CDN_BASE_URL,
  moderationMinConfidence: process.env.MODERATION_MIN_CONFIDENCE,
  photoMaxBytes: process.env.PHOTO_MAX_BYTES,
  photoPerVehicleCap: process.env.PHOTO_PER_VEHICLE_CAP,
});

if (!parsed.success) {
  const detail = parsed.error.issues.map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`).join("\n");
  throw new Error(`Invalid environment configuration:\n${detail}`);
}

const env = parsed.data;

export const config = {
  nodeEnv: env.nodeEnv,
  isProduction,
  port: env.port,
  host: env.host,
  jwtSecret: env.jwtSecret,
  storage: {
    driver: env.storageDriver,
    localDir: resolve(process.cwd(), env.localStorageDir),
    publicBaseUrl: env.mediaPublicBaseUrl.replace(/\/$/, ""),
  },
  moderation: {
    driver: env.moderationDriver,
    minConfidence: env.moderationMinConfidence,
  },
  aws: {
    region: env.awsRegion,
    s3Bucket: env.s3Bucket,
    cdnBaseUrl: env.cdnBaseUrl?.replace(/\/$/, ""),
  },
  photos: {
    maxBytes: env.photoMaxBytes,
    perVehicleCap: env.photoPerVehicleCap,
  },
} as const;

export type AppConfig = typeof config;
