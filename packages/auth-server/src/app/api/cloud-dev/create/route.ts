import { type NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { execSync } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { authenticateRequest } from "@/lib/auth";
import { getPool } from "@/lib/db";
import { flyctlSync } from "@/lib/flyctl";
import { createMachine, type CreateMachineConfig } from "@/lib/fly";

const FLY_ORG = process.env.FLY_ORG ?? "tiger-data";
const FLY_REGION = process.env.FLY_REGION ?? "iad";
const CLOUD_DEV_IMAGE =
  process.env.CLOUD_DEV_IMAGE ?? "registry.fly.io/opflow-cloud-dev-image:latest";

/**
 * POST /api/cloud-dev/create
 * Create a cloud dev machine for the authenticated user.
 */
export async function POST(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const body = (await req.json()) as {
      appName?: string;
      envVars?: Record<string, string>;
    };

    if (!body.appName) {
      return NextResponse.json(
        { error: "appName is required" },
        { status: 400 },
      );
    }

    const { appName, envVars = {} } = body;
    const db = await getPool();

    // Check for existing machine with this app name
    const existing = await db.query(
      `SELECT dm.fly_app_name, dm.app_url
       FROM dev_machines dm
       JOIN dev_machine_members dmm ON dm.id = dmm.machine_id
       WHERE dmm.user_id = $1 AND dm.app_name = $2`,
      [userId, appName],
    );

    if (existing.rows.length > 0) {
      return NextResponse.json({
        data: {
          appUrl: existing.rows[0].app_url as string,
        },
      });
    }

    // Generate unpredictable Fly app name
    const hexId = crypto.randomBytes(4).toString("hex");
    const flyAppName = `opflow-dev-${hexId}`;
    const appUrl = `https://${flyAppName}.fly.dev`;
    const linuxUser = `user-${userId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 16)}`;

    console.log(`[cloud-dev/create] Creating Fly app: ${flyAppName}`);

    // 1. Create Fly app
    flyctlSync(["apps", "create", flyAppName, "--org", FLY_ORG]);

    // 2. Create Fly volume
    let volumeId: string;
    try {
      const volOutput = flyctlSync([
        "volumes",
        "create",
        "app_data",
        "-s",
        "10",
        "-r",
        FLY_REGION,
        "-a",
        flyAppName,
        "-y",
        "-j",
      ]);
      const volData = JSON.parse(volOutput) as { id?: string };
      volumeId = volData.id ?? "";
      if (!volumeId) {
        throw new Error(`No volume ID in response: ${volOutput}`);
      }
    } catch (err) {
      // Clean up Fly app on volume creation failure
      try {
        flyctlSync(["apps", "destroy", flyAppName, "-y"]);
      } catch { /* ignore cleanup errors */ }
      throw err;
    }

    // 3. Allocate shared IPv4
    try {
      flyctlSync(["ips", "allocate-v4", "--shared", "-a", flyAppName]);
    } catch (err) {
      console.log(
        `[cloud-dev/create] IP allocation warning: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    // 4. Set secrets (env vars) — staged so they apply when machine starts
    const secrets = {
      ...envVars,
      APP_NAME: appName,
      DEV_USER: linuxUser,
    };
    const secretsFile = join(tmpdir(), `secrets-${flyAppName}.env`);
    const secretsContent = Object.entries(secrets)
      .map(([k, v]) => `${k}=${v}`)
      .join("\n");
    writeFileSync(secretsFile, secretsContent);
    try {
      execSync(
        `flyctl secrets import -a ${flyAppName} --stage < ${secretsFile}`,
        {
          env: { ...process.env, FLY_API_TOKEN: process.env.FLY_API_TOKEN },
          stdio: "pipe",
          timeout: 15000,
          shell: "/bin/bash",
        },
      );
    } catch (err) {
      console.log(
        `[cloud-dev/create] Secrets import warning: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      try { unlinkSync(secretsFile); } catch { /* ignore */ }
    }

    // 5. Create machine via Fly Machines API
    const machineConfig: CreateMachineConfig = {
      image: CLOUD_DEV_IMAGE,
      services: [
        {
          ports: [
            { port: 443, handlers: ["tls", "http"] },
            { port: 80, handlers: ["http"] },
          ],
          protocol: "tcp",
          internal_port: 4173,
          auto_stop_machines: "stop",
          auto_start_machines: true,
        },
      ],
      guest: {
        cpu_kind: "shared",
        cpus: 2,
        memory_mb: 2048,
      },
      mounts: [
        {
          volume: volumeId,
          path: "/data",
        },
      ],
    };

    const machine = await createMachine(flyAppName, machineConfig);
    console.log(
      `[cloud-dev/create] Machine created: ${machine.id} for ${flyAppName}`,
    );

    // 6. Insert into dev_machines + dev_machine_members
    const insertResult = await db.query(
      `INSERT INTO dev_machines (app_name, fly_app_name, app_url, created_by)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [appName, flyAppName, appUrl, userId],
    );

    const machineDbId = insertResult.rows[0].id as number;

    await db.query(
      `INSERT INTO dev_machine_members (machine_id, user_id, role, linux_user)
       VALUES ($1, $2, 'owner', $3)`,
      [machineDbId, userId, linuxUser],
    );

    return NextResponse.json({
      data: { appUrl, flyAppName },
    });
  } catch (err) {
    console.error(
      `[cloud-dev/create] Error: ${err instanceof Error ? err.message : String(err)}`,
    );
    return NextResponse.json(
      {
        error: `Create failed: ${err instanceof Error ? err.message : String(err)}`,
      },
      { status: 500 },
    );
  }
}
