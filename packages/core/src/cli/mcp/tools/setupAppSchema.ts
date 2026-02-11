import { exec } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import type { ApiFactory } from "@tigerdata/mcp-boilerplate";
import * as dotenv from "dotenv";
import pg from "pg";
import { z } from "zod";
import type { ServerContext } from "../types.js";

const execAsync = promisify(exec);

const inputSchema = {
  directory: z
    .string()
    .optional()
    .default(".")
    .describe("Directory of the application, relative to cwd (default: current working directory)"),
  service_id: z.string().describe("Tiger Cloud service ID for the database"),
  app_name: z
    .string()
    .regex(
      /^[a-z][a-z0-9_]*$/,
      "App name must be lowercase alphanumeric with underscores, starting with a letter",
    )
    .describe(
      "Application name (used for schema and user name, must be lowercase with underscores)",
    ),
} as const;

const outputSchema = {
  success: z.boolean().describe("Whether app schema setup succeeded"),
  message: z.string().describe("Status message"),
  schema_name: z.string().optional().describe("Name of the created schema"),
  user_name: z.string().optional().describe("Name of the created user"),
} as const;

type OutputSchema = {
  success: boolean;
  message: string;
  schema_name?: string | undefined;
  user_name?: string | undefined;
};

function generatePassword(length = 24): string {
  const chars =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let password = "";
  for (let i = 0; i < length; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

function buildConnectionString(
  originalUrl: string,
  user: string,
  password: string,
): string {
  const parsed = new URL(originalUrl);
  parsed.username = user;
  parsed.password = encodeURIComponent(password);
  if (!parsed.searchParams.has("uselibpqcompat")) {
    parsed.searchParams.set("uselibpqcompat", "true");
  }
  return parsed.toString();
}

export const setupAppSchemaFactory: ApiFactory<
  ServerContext,
  typeof inputSchema,
  typeof outputSchema
> = () => {
  return {
    name: "setup_app_schema",
    config: {
      title: "Setup App Schema",
      description:
        "Set up database schema and user for the application. Creates a PostgreSQL schema and user named after the app, with appropriate permissions, and writes DATABASE_URL to .env.",
      inputSchema,
      outputSchema,
    },
    fn: async ({
      directory,
      service_id,
      app_name,
    }): Promise<OutputSchema> => {
      const appDir = resolve(process.cwd(), directory);
      const envPath = join(appDir, ".env");

      // Check if we've already run this tool (DATABASE_SCHEMA is only set by us)
      if (existsSync(envPath)) {
        const envContent = await readFile(envPath, "utf-8");
        const env = dotenv.parse(envContent);
        if (env.DATABASE_SCHEMA) {
          return {
            success: true,
            message:
              "DATABASE_SCHEMA already set in .env. Delete it and re-run if you need to regenerate.",
            schema_name: app_name,
            user_name: app_name,
          };
        }
      }

      // Get database connection string from Tiger
      let adminConnectionString: string;
      try {
        const { stdout: serviceJson } = await execAsync(
          `tiger service get ${service_id} --with-password -o json`,
        );
        const serviceDetails = JSON.parse(serviceJson) as {
          connection_string?: string;
        };

        if (!serviceDetails.connection_string) {
          return {
            success: false,
            message: "connection_string not found in service details",
          };
        }
        const parsed = new URL(serviceDetails.connection_string);
        if (!parsed.searchParams.has("uselibpqcompat")) {
          parsed.searchParams.set("uselibpqcompat", "true");
        }
        adminConnectionString = parsed.toString();
      } catch (err) {
        const error = err as Error;
        return {
          success: false,
          message: `Failed to get service details: ${error.message}`,
        };
      }

      // Connect using pg as admin
      const pool = new pg.Pool({ connectionString: adminConnectionString, max: 1 });

      try {
        // Check if user already exists
        const existingUser = await pool.query(
          `SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = $1`,
          [app_name],
        );

        if (existingUser.rows.length > 0) {
          return {
            success: false,
            message: `User '${app_name}' already exists. Choose a different app name or delete the existing user.`,
          };
        }

        // Create new user
        const appPassword = generatePassword();
        await pool.query(
          `CREATE ROLE ${app_name} WITH LOGIN PASSWORD '${appPassword}'`,
        );

        // Grant app role to tsdbadmin so admin can access app objects
        await pool.query(`GRANT ${app_name} TO tsdbadmin WITH INHERIT TRUE`);

        // Create app schema owned by the app user
        await pool.query(
          `CREATE SCHEMA IF NOT EXISTS ${app_name} AUTHORIZATION ${app_name}`,
        );
        await pool.query(
          `CREATE SCHEMA IF NOT EXISTS ${app_name}_dbos AUTHORIZATION ${app_name}`,
        );

        //annoyingly, dbos seems to need this. TODO: find a better way to do this.
        await pool.query(
          `GRANT CREATE ON DATABASE tsdb TO ${app_name}`,
        );

        // Allow using extensions in public schema, but not creating objects there
        await pool.query(`REVOKE CREATE ON SCHEMA public FROM ${app_name}`);
        await pool.query(`GRANT USAGE ON SCHEMA public TO ${app_name}`);

        // Set search_path for app user (app schema first, then public for extensions)
        await pool.query(
          `ALTER ROLE ${app_name} SET search_path TO ${app_name}, ${app_name}_dbos, public`,
        );

        // Append app schema to tsdbadmin's search_path
        const currentPath = await pool.query(
          `SELECT setting FROM pg_settings WHERE name = 'search_path'`,
        );
        const existingPath = currentPath.rows[0]?.setting ?? "public";
        if (!existingPath.includes(app_name)) {
          await pool.query(
            `ALTER ROLE tsdbadmin SET search_path TO ${existingPath}, ${app_name}, ${app_name}_dbos`,
          );
        }

        // Create dbosadmin role for DBOS Cloud BYOD (Bring Your Own Database)
        const existingAdmin = await pool.query(
          `SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'dbosadmin'`,
        );
        let dbosAdminPassword: string | undefined;
        if (existingAdmin.rows.length === 0) {
          dbosAdminPassword = generatePassword();
          await pool.query(
            `CREATE ROLE dbosadmin WITH LOGIN CREATEDB PASSWORD '${dbosAdminPassword}'`,
          );
        }

        // Build app connection string
        const appDatabaseUrl = buildConnectionString(
          adminConnectionString,
          app_name,
          appPassword,
        );

        // Write or update .env file
        let envContent = "";
        if (existsSync(envPath)) {
          envContent = await readFile(envPath, "utf-8");
        }

        // Update or add DATABASE_URL, DATABASE_SCHEMA, and DBOS_ADMIN_URL
        const env = dotenv.parse(envContent);
        env.DATABASE_URL = appDatabaseUrl;
        env.DATABASE_SCHEMA = app_name;
        if (dbosAdminPassword) {
          env.DBOS_ADMIN_URL = buildConnectionString(
            adminConnectionString,
            "dbosadmin",
            dbosAdminPassword,
          );
        }

        // Rebuild .env content
        const newEnvContent = Object.entries(env)
          .map(([key, value]) => `${key}="${value}"`)
          .join("\n");

        await writeFile(envPath, `${newEnvContent}\n`);
      } catch (err) {
        const error = err as Error;
        return {
          success: false,
          message: `Failed to set up app schema: ${error.message}`,
        };
      } finally {
        await pool.end();
      }

      return {
        success: true,
        message: `Created schema '${app_name}' and user '${app_name}'. DATABASE_URL and DATABASE_SCHEMA written to .env.`,
        schema_name: app_name,
        user_name: app_name,
      };
    },
  };
};
