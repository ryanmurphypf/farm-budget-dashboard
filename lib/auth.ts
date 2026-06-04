import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { getDb } from "./db";

const SESSION_COOKIE = "fb_session";
const SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "peterson-farms-budget-secret-2026"
);

export async function login(password: string): Promise<boolean> {
  const db = await getDb();
  const result = await db.query("SELECT value FROM settings WHERE key = 'password_hash'");
  if (result.rows.length === 0) return false;
  const match = await bcrypt.compare(password, result.rows[0].value);
  if (!match) return false;

  const token = await new SignJWT({ authenticated: true })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("365d")
    .sign(SECRET);

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 365 * 24 * 60 * 60,
    path: "/",
  });
  return true;
}

export async function logout() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

export async function verifyToken(token: string): Promise<boolean> {
  try { await jwtVerify(token, SECRET); return true; } catch { return false; }
}
