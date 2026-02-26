import { type NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { execSync } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { authenticateRequest } from "@/lib/auth";
import { getPool } from "@/lib/db";
import { flyctlSync } from "@/lib/flyctl";
import { createMachine, createVolume, deleteVolume, type CreateMachineConfig } from "@/lib/fly";
import { setupSchemaFromUrl } from "@/lib/schema-ops";

/**
 * Generate an Ed25519 SSH keypair using Node.js crypto.
 * Returns the public key in OpenSSH authorized_keys format
 * and the private key in OpenSSH format (BEGIN OPENSSH PRIVATE KEY).
 *
 * PKCS8 PEM (BEGIN PRIVATE KEY) is NOT used because macOS's SSH client
 * doesn't support it for Ed25519 keys.
 */
function generateSSHKeypair(): { publicKey: string; privateKey: string } {
  const keypair = crypto.generateKeyPairSync("ed25519");

  // Extract raw 32-byte keys from DER encoding
  const spkiDer = keypair.publicKey.export({ type: "spki", format: "der" }) as Buffer;
  const rawPub = spkiDer.subarray(12); // Ed25519 SPKI DER: 12-byte header + 32-byte key

  const pkcs8Der = keypair.privateKey.export({ type: "pkcs8", format: "der" }) as Buffer;
  const rawSeed = pkcs8Der.subarray(16); // Ed25519 PKCS8 DER: 16-byte header + 32-byte seed

  // Helper: write an SSH wire-format string (uint32 length prefix + data)
  const sshString = (data: Buffer): Buffer => {
    const buf = Buffer.alloc(4 + data.length);
    buf.writeUInt32BE(data.length, 0);
    data.copy(buf, 4);
    return buf;
  };
  const sshUint32 = (n: number): Buffer => {
    const buf = Buffer.alloc(4);
    buf.writeUInt32BE(n, 0);
    return buf;
  };

  const keyTypeStr = Buffer.from("ssh-ed25519");

  // Public key in OpenSSH wire format
  const pubWire = Buffer.concat([sshString(keyTypeStr), sshString(rawPub)]);
  const publicKey = `ssh-ed25519 ${pubWire.toString("base64")}`;

  // Private key in OpenSSH format
  const checkInt = crypto.randomBytes(4);
  const privSection = Buffer.concat([
    checkInt,                                    // checkint1
    checkInt,                                    // checkint2 (must match)
    sshString(keyTypeStr),                       // key type
    sshString(rawPub),                           // public key (32 bytes)
    sshString(Buffer.concat([rawSeed, rawPub])), // private key (64 bytes: seed + pub)
    sshString(Buffer.alloc(0)),                  // comment (empty)
  ]);

  // Pad to cipher block size (8 for "none")
  const padLen = (8 - (privSection.length % 8)) % 8;
  const padding = Buffer.from(Array.from({ length: padLen }, (_, i) => i + 1));

  const none = Buffer.from("none");
  const fullKey = Buffer.concat([
    Buffer.from("openssh-key-v1\0"),              // magic
    sshString(none),                              // ciphername
    sshString(none),                              // kdfname
    sshString(Buffer.alloc(0)),                   // kdfoptions
    sshUint32(1),                                 // number of keys
    sshString(pubWire),                           // public key
    sshString(Buffer.concat([privSection, padding])), // private section
  ]);

  // Wrap base64 to 70-char lines
  const b64Lines = fullKey.toString("base64").match(/.{1,70}/g) ?? [];
  const privateKey = [
    "-----BEGIN OPENSSH PRIVATE KEY-----",
    ...b64Lines,
    "-----END OPENSSH PRIVATE KEY-----",
    "",
  ].join("\n");

  return { publicKey, privateKey };
}

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

    // Generate SSH keypair for remote access
    const sshKeypair = generateSSHKeypair();

    // Provision shared DB schema before creating any Fly resources so no
    // cleanup is needed if this step fails.
    let sharedDbSchema: string | null = null;
    let sharedDbHostname: string | null = null;
    let provisionedEnvVars: Record<string, string> = {};

    if (!envVars?.DATABASE_URL) {
      const DATABASE_DATA_URL = process.env.DATABASE_DATA_URL;
      if (!DATABASE_DATA_URL) {
        return NextResponse.json(
          { error: "No DATABASE_URL provided and DATABASE_DATA_URL is not configured on the server." },
          { status: 400 },
        );
      }
      console.log(`[cloud-dev/create] Provisioning shared DB schema for ${flyAppName}`);
      const creds = await setupSchemaFromUrl(DATABASE_DATA_URL, flyAppName);
      provisionedEnvVars = { DATABASE_URL: creds.DATABASE_URL, DATABASE_SCHEMA: creds.DATABASE_SCHEMA };
      sharedDbSchema = creds.DATABASE_SCHEMA;
      sharedDbHostname = new URL(DATABASE_DATA_URL).hostname;
    }

    console.log(`[cloud-dev/create] Creating Fly app: ${flyAppName}`);

    // 1. Create Fly app
    flyctlSync(["apps", "create", flyAppName, "--org", FLY_ORG]);

    // 2. Allocate dedicated IPv4 (required for raw TCP services like SSH;
    //    shared IPv4 only supports HTTP/TLS via Fly's Anycast proxy)
    try {
      flyctlSync(["ips", "allocate-v4", "-a", flyAppName, "-y"]);
    } catch (err) {
      console.error(
        `[cloud-dev/create] IPv4 allocation failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      try { flyctlSync(["apps", "destroy", flyAppName, "-y"]); } catch { /* ignore */ }
      throw new Error(`IPv4 allocation failed — machine would be unreachable`);
    }

    // 3. Set secrets (env vars) — staged so they apply when machine starts
    const secrets: Record<string, string> = {
      ...envVars,
      ...provisionedEnvVars,
      APP_NAME: appName,
      DEV_USER: linuxUser,
      SSH_PUBLIC_KEY: sshKeypair.publicKey,
    };
    if (process.env.PUBLIC_URL) {
      secrets.OPFLOW_SERVER_URL = process.env.PUBLIC_URL;
    }
    const secretsFile = join(tmpdir(), `secrets-${flyAppName}.env`);
    writeFileSync(secretsFile, Object.entries(secrets).map(([k, v]) => `${k}=${v}`).join("\n"));
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

    // 4. Create volume + machine — retry across fallback regions if host lacks capacity.
    //    The `compute` hint asks Fly to pin the volume to a host that can also run a
    //    machine with those specs, but it's not always honoured (412 on machine create).
    //    When that happens we delete the volume and try the next region.
    const machineGuest = { cpu_kind: "shared", cpus: 6, memory_mb: 1536 };
    const regionCandidates = [FLY_REGION, "ewr", "bos"].filter(
      (r, i, arr) => arr.indexOf(r) === i,
    );
    const machineServicesConfig: CreateMachineConfig["services"] = [
      {
        ports: [
          { port: 443, handlers: ["tls", "http"] },
          { port: 80, handlers: ["http"] },
        ],
        protocol: "tcp",
        internal_port: 4173,
        autostop: "stop",
        autostart: true,
        min_machines_running: 0,
      },
      {
        ports: [{ port: 2222, handlers: [] }],
        protocol: "tcp",
        internal_port: 2222,
        autostop: "stop",
        autostart: true,
        min_machines_running: 0,
      },
    ];

    let machine: Awaited<ReturnType<typeof createMachine>> | undefined;
    let lastProvisionErr: unknown;
    for (const region of regionCandidates) {
      let currentVolumeId = "";
      try {
        console.log(`[cloud-dev/create] Trying region: ${region}`);
        const vol = await createVolume(flyAppName, "app_data", 10, region, machineGuest);
        currentVolumeId = vol.id;
        machine = await createMachine(flyAppName, {
          image: CLOUD_DEV_IMAGE,
          services: machineServicesConfig,
          guest: machineGuest,
          mounts: [{ volume: currentVolumeId, path: "/data" }],
        }, region);
        if (region !== FLY_REGION) {
          console.log(`[cloud-dev/create] Provisioned in fallback region: ${region}`);
        }
        break;
      } catch (err) {
        lastProvisionErr = err;
        console.warn(
          `[cloud-dev/create] Failed in region ${region}: ${err instanceof Error ? err.message : String(err)}`,
        );
        if (currentVolumeId) {
          try { await deleteVolume(flyAppName, currentVolumeId); } catch { /* ignore */ }
        }
      }
    }
    if (!machine) {
      try { flyctlSync(["apps", "destroy", flyAppName, "-y"]); } catch { /* ignore */ }
      throw new Error(`Failed to create machine for "${flyAppName}": ${lastProvisionErr instanceof Error ? lastProvisionErr.message : String(lastProvisionErr)}`);
    }
    console.log(
      `[cloud-dev/create] Machine created: ${machine.id} for ${flyAppName}`,
    );

    // 6. Insert into dev_machines + dev_machine_members
    const insertResult = await db.query(
      `INSERT INTO dev_machines (app_name, fly_app_name, app_url, created_by, ssh_private_key, shared_db_schema, shared_db_hostname)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [appName, flyAppName, appUrl, userId, sshKeypair.privateKey, sharedDbSchema, sharedDbHostname],
    );

    const machineDbId = insertResult.rows[0].id as number;

    await db.query(
      `INSERT INTO dev_machine_members (machine_id, user_id, role, linux_user)
       VALUES ($1, $2, 'owner', $3)`,
      [machineDbId, userId, linuxUser],
    );

    return NextResponse.json({
      data: { appUrl, flyAppName, sshPrivateKey: sshKeypair.privateKey },
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
