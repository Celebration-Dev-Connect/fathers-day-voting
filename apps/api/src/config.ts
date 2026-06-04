import { resolve } from "node:path";
import { z } from "zod";

export const eventId = "event-2026-fathers-day";

const isProduction = process.env.NODE_ENV === "production";

const storageDriverSchema = z.enum(["local", "s3"]);
const moderationDriverSchema = z.enum(["mock", "rekognition"]);
const textModerationDriverSchema = z.enum(["mock", "comprehend", "none"]);

const envSchema = z
  .object({
    nodeEnv: z.string().default("development"),
    port: z.coerce.number().int().positive().default(4000),
    host: z.string().default("0.0.0.0"),
    // In production a real secret is mandatory; in dev we fall back.
    jwtSecret: z.string().min(1).default(isProduction ? "" : "local-dev-secret-change-me"),

    storageDriver: storageDriverSchema.default("local"),
    moderationDriver: moderationDriverSchema.default("mock"),
    textModerationDriver: textModerationDriverSchema.default("mock"),
    textModerationMinConfidence: z.coerce.number().min(0).max(1).default(0.5),

    // Enables the email/dev-login path even when NODE_ENV=production.
    // Used for test deployments that run real infra (S3/RDS/Rekognition) but
    // keep local staff login while Planning Center OAuth is not yet wired up.
    // Omit it and the default tracks NODE_ENV (on in dev, off in prod).
    enableDevLogin: z.enum(["true", "false"]).optional(),

    // Local filesystem driver
    localStorageDir: z.string().default("var/media"),
    mediaPublicBaseUrl: z.string().default("http://localhost:4000"),

    // S3 / Rekognition drivers
    awsRegion: z.string().optional(),
      rekognitionRegion: z.string().optional(),
    s3Bucket: z.string().optional(),
    cdnBaseUrl: z.string().optional(),
    moderationMinConfidence: z.coerce.number().min(0).max(100).default(60),

    // Common upload limits
    photoMaxBytes: z.coerce.number().int().positive().default(5 * 1024 * 1024),
    photoPerVehicleCap: z.coerce.number().int().positive().default(10),

    // Planning Center Online OAuth (production staff login)
    planningCenterClientId: z.string().optional(),
    planningCenterClientSecret: z.string().optional(),
    planningCenterCallbackUrl: z.string().url().optional(),
    planningCenterTeamName: z.string().default("carshow"),
    adminWebUrl: z.string().url().optional(),
    judgeWebUrl: z.string().url().optional(),
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
  textModerationDriver: process.env.TEXT_MODERATION_DRIVER,
  textModerationMinConfidence: process.env.TEXT_MODERATION_MIN_CONFIDENCE,
  enableDevLogin: process.env.ENABLE_DEV_LOGIN,
  localStorageDir: process.env.LOCAL_STORAGE_DIR,
  mediaPublicBaseUrl: process.env.MEDIA_PUBLIC_BASE_URL,
  awsRegion: process.env.AWS_REGION,
  rekognitionRegion: process.env.REKOGNITION_REGION,
  s3Bucket: process.env.S3_BUCKET,
  cdnBaseUrl: process.env.CDN_BASE_URL,
  moderationMinConfidence: process.env.MODERATION_MIN_CONFIDENCE,
  photoMaxBytes: process.env.PHOTO_MAX_BYTES,
  photoPerVehicleCap: process.env.PHOTO_PER_VEHICLE_CAP,
  planningCenterClientId: process.env.PLANNING_CENTER_CLIENT_ID,
  planningCenterClientSecret: process.env.PLANNING_CENTER_CLIENT_SECRET,
  planningCenterCallbackUrl: process.env.PLANNING_CENTER_CALLBACK_URL,
  planningCenterTeamName: process.env.PCO_TEAM_NAME,
  adminWebUrl: process.env.ADMIN_WEB_URL,
  judgeWebUrl: process.env.JUDGE_WEB_URL,
});

if (!parsed.success) {
  const detail = parsed.error.issues.map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`).join("\n");
  throw new Error(`Invalid environment configuration:\n${detail}`);
}

const env = parsed.data;

// Defaults to the inverse of production unless explicitly overridden.
const enableDevLogin = env.enableDevLogin ? env.enableDevLogin === "true" : !isProduction;

export const config = {
  nodeEnv: env.nodeEnv,
  isProduction,
  enableDevLogin,
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
  textModeration: {
    driver: env.textModerationDriver,
    minConfidence: env.textModerationMinConfidence,
  },
  aws: {
    region: env.awsRegion,
    rekognitionRegion: env.rekognitionRegion ?? env.awsRegion,
    s3Bucket: env.s3Bucket,
    cdnBaseUrl: env.cdnBaseUrl?.replace(/\/$/, ""),
  },
  photos: {
    maxBytes: env.photoMaxBytes,
    perVehicleCap: env.photoPerVehicleCap,
  },
  planningCenter: {
    clientId: env.planningCenterClientId,
    clientSecret: env.planningCenterClientSecret,
    callbackUrl: env.planningCenterCallbackUrl,
    teamName: env.planningCenterTeamName,
  },
  adminWebUrl: env.adminWebUrl,
  judgeWebUrl: env.judgeWebUrl,
} as const;

export type AppConfig = typeof config;
