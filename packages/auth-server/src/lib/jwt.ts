import { SignJWT, importPKCS8 } from "jose";

let privateKey: Awaited<ReturnType<typeof importPKCS8>> | null = null;
let publicKeyPEM: string | null = null;

/**
 * Load the Ed25519 private key from DEV_UI_JWT_PRIVATE_KEY env var.
 * The key is in PKCS8 PEM format.
 */
async function ensureKeys(): Promise<void> {
  if (privateKey) return;

  const pem = process.env.DEV_UI_JWT_PRIVATE_KEY;
  if (!pem) {
    throw new Error(
      "DEV_UI_JWT_PRIVATE_KEY environment variable is required for dev-ui auth",
    );
  }

  // jose importPKCS8 expects proper PEM with newlines
  const normalizedPem = pem.replace(/\\n/g, "\n");
  privateKey = await importPKCS8(normalizedPem, "EdDSA");

  // Derive public key PEM from the private key
  // Node.js crypto can derive public from private for Ed25519
  const crypto = await import("node:crypto");
  const keyObj = crypto.createPrivateKey(normalizedPem);
  const pubObj = crypto.createPublicKey(keyObj);
  publicKeyPEM = pubObj.export({ type: "spki", format: "pem" }) as string;
}

/**
 * Sign a dev-ui JWT for a specific machine and user.
 */
export async function signDevUIToken(payload: {
  sub: string;
  app: string;
  login: string;
}): Promise<string> {
  await ensureKeys();
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "EdDSA" })
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(privateKey!);
}

/**
 * Get the Ed25519 public key in PEM format (for passing to machines).
 */
export async function getPublicKeyPEM(): Promise<string> {
  await ensureKeys();
  return publicKeyPEM!;
}
