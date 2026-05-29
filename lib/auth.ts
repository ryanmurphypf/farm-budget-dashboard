import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { getDb } from "./db";

const SESSION_COOKIE = "fb_session";
const SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "peterson-farms-budget-secret-2026"
);

export async function login(password: string): Promise<boolean> {
  const db = getDb();
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get("password_hash") as { value: string } | undefined;
  if (!row) return false;
  const match = await bcrypt.compare(password, row.value);
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
