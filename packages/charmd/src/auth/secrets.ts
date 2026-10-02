import {
  createHash,
  randomBytes,
  randomInt,
  scrypt,
  timingSafeEqual,
} from "node:crypto";

// scrypt cost: ~50 ms per check on a laptop, so guessing is slow and five tries end it anyway.
const SCRYPT = { N: 2 ** 15, r: 8, p: 1, keyLength: 32, saltBytes: 16 };
const SCRYPT_MAXMEM = 64 * 1024 * 1024;

function scryptAsync(
  pin: string,
  salt: Buffer,
  N: number,
  r: number,
  p: number
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      pin,
      salt,
      SCRYPT.keyLength,
      { N, r, p, maxmem: SCRYPT_MAXMEM },
      (error, key) => (error ? reject(error) : resolve(key))
    );
  });
}

function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function generatePairCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

async function hashPin(pin: string): Promise<string> {
  const salt = randomBytes(SCRYPT.saltBytes);
  const key = await scryptAsync(pin, salt, SCRYPT.N, SCRYPT.r, SCRYPT.p);
  return [
    "scrypt",
    SCRYPT.N,
    SCRYPT.r,
    SCRYPT.p,
    salt.toString("base64url"),
    key.toString("base64url"),
  ].join("$");
}

async function verifyPin(pin: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, salt, key] = stored.split("$");
  if (scheme !== "scrypt" || !n || !r || !p || !salt || !key) return false;
  const expected = Buffer.from(key, "base64url");
  const actual = await scryptAsync(
    pin,
    Buffer.from(salt, "base64url"),
    Number(n),
    Number(r),
    Number(p)
  );
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export { generatePairCode, generateToken, hashPin, hashToken, verifyPin };
