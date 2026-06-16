import { resolve } from "node:path";
import { z } from "zod";

export const eventId = "event-2026-fathers-day";

const isProduction = process.env.NODE_ENV === "production";

const storageDriverSchema = z.enum(["local", "s3"]);
const moderationDriverSchema = z.enum(["mock", "rekognition"]);
const textModerationDriverSchema = z.enum(["mock", "comprehend", "none"]);
const emailDriverSchema = z.enum(["console", "ses"]);

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
    emailDriver: emailDriverSchema.default("console"),
    emailFromAddress: z.string().email().default("noreply@fathersdaycarshow.ca"),
    emailFromName: z.string().default("Father's Day Car Show"),
    emailSmtpHost: z.string().optional(),
    emailSmtpPort: z.coerce.number().int().positive().default(465),
    emailSmtpUsername: z.string().optional(),
    emailSmtpPassword: z.string().optional(),
    ownerPortalUrl: z.string().url().default("https://visit.fathersdaycarshow.ca/owner"),
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

    // File-size limit for all uploads; count cap for combined owner/staff uploads.
    photoMaxBytes: z.coerce.number().int().positive().default(5 * 1024 * 1024),
    photoPerVehicleCap: z.coerce.number().int().positive().default(15),

    // Planning Center Online OAuth (production staff login)
    planningCenterClientId: z.string().optional(),
    planningCenterClientSecret: z.string().optional(),
    planningCenterCallbackUrl: z.string().url().optional(),
    planningCenterTeamName: z.string().default("carshow"),
    webguideBaseUrl: z.string().url().default("https://www.celebrationedmonton.com"),
    webguideUsername: z.string().optional(),
    webguidePassword: z.string().optional(),
    adminWebUrl: z.string().url().optional(),
    judgeWebUrl: z.string().url().optional(),
    // Comma-separated list of allowed CORS origins. When unset, the API reflects
    // any origin (fine in dev where SPAs run on different localhost ports, and
    // harmless in prod where SPAs are same-origin behind one CloudFront domain).
    // Set it in prod to lock the API to the known web origin(s).
    corsAllowedOrigins: z.string().optional(),
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
    if (value.emailDriver === "ses") {
      for (const key of ["emailSmtpHost", "emailSmtpUsername", "emailSmtpPassword"] as const) {
        if (!value[key]) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: [key], message: `${key} is required when EMAIL_DRIVER=ses` });
        }
      }
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
  webguideBaseUrl: process.env.WEBGUIDE_BASE_URL,
  webguideUsername: process.env.WEBGUIDE_USERNAME ?? process.env.WEBGUIDEUSERNAME,
  webguidePassword: process.env.WEBGUIDE_PASSWORD ?? process.env.WEBGUIDEPASSWORD,
  adminWebUrl: process.env.ADMIN_WEB_URL,
  judgeWebUrl: process.env.JUDGE_WEB_URL,
  corsAllowedOrigins: process.env.CORS_ALLOWED_ORIGINS,
  emailDriver: process.env.EMAIL_DRIVER,
  emailFromAddress: process.env.EMAIL_FROM_ADDRESS,
  emailFromName: process.env.EMAIL_FROM_NAME,
  emailSmtpHost: process.env.EMAIL_SMTP_HOST,
  emailSmtpPort: process.env.EMAIL_SMTP_PORT,
  emailSmtpUsername: process.env.EMAIL_SMTP_USERNAME,
  emailSmtpPassword: process.env.EMAIL_SMTP_PASSWORD,
  ownerPortalUrl: process.env.OWNER_PORTAL_URL,
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
  webGuide: {
    baseUrl: env.webguideBaseUrl.replace(/\/$/, ""),
    username: env.webguideUsername,
    password: env.webguidePassword,
  },
  adminWebUrl: env.adminWebUrl,
  judgeWebUrl: env.judgeWebUrl,
  corsAllowedOrigins: env.corsAllowedOrigins
    ? env.corsAllowedOrigins.split(",").map((origin) => origin.trim()).filter(Boolean)
    : null,
  email: {
    driver: env.emailDriver,
    fromAddress: env.emailFromAddress,
    fromName: env.emailFromName,
    smtp: {
      host: env.emailSmtpHost,
      port: env.emailSmtpPort,
      username: env.emailSmtpUsername,
      password: env.emailSmtpPassword,
    },
  },
  ownerPortalUrl: env.ownerPortalUrl,
} as const;

export type AppConfig = typeof config;
