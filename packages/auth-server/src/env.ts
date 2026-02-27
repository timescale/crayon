import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().min(1),
    DATABASE_DATA_URL: z.string().min(1).optional(),
    GITHUB_CLIENT_ID: z.string().min(1),
    GITHUB_CLIENT_SECRET: z.string().min(1),
    NANGO_SECRET_KEY: z.string().min(1),
    FLY_API_TOKEN: z.string().min(1),
    FLY_ORG: z.string().min(1),
    FLY_REGION: z.string().min(1).optional(),
    CLOUD_DEV_IMAGE: z.string().min(1).optional(),
    PUBLIC_URL: z.string().url().optional(),
    DEV_UI_JWT_PRIVATE_KEY: z.string().min(1),
  },
  client: {
    NEXT_PUBLIC_GITHUB_CLIENT_ID: z.string().min(1),
  },
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    DATABASE_DATA_URL: process.env.DATABASE_DATA_URL,
    GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID,
    GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET,
    NANGO_SECRET_KEY: process.env.NANGO_SECRET_KEY,
    FLY_API_TOKEN: process.env.FLY_API_TOKEN,
    FLY_ORG: process.env.FLY_ORG,
    FLY_REGION: process.env.FLY_REGION,
    CLOUD_DEV_IMAGE: process.env.CLOUD_DEV_IMAGE,
    PUBLIC_URL: process.env.PUBLIC_URL,
    DEV_UI_JWT_PRIVATE_KEY: process.env.DEV_UI_JWT_PRIVATE_KEY,
    NEXT_PUBLIC_GITHUB_CLIENT_ID: process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID,
  },
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});
