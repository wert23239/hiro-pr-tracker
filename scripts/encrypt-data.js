#!/usr/bin/env node

const { createCipheriv, pbkdf2Sync, randomBytes } = require("node:crypto");
const { mkdirSync, readFileSync, writeFileSync } = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const inputPath = path.join(root, "data", "prs.json");
const outputPath = path.join(root, "data", "prs.enc.json");
const password = process.env.HIRO_TRACKER_PASSWORD || "openclaw";
const iterations = Number(process.env.HIRO_TRACKER_KDF_ITERATIONS || 250000);

const salt = randomBytes(16);
const iv = randomBytes(12);
const key = pbkdf2Sync(password, salt, iterations, 32, "sha256");
const cipher = createCipheriv("aes-256-gcm", key, iv);
const plaintext = readFileSync(inputPath);
const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
const authTag = cipher.getAuthTag();

mkdirSync(path.dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify({
  version: 1,
  algorithm: "AES-GCM",
  kdf: "PBKDF2-SHA256",
  iterations,
  salt: salt.toString("base64"),
  iv: iv.toString("base64"),
  authTag: authTag.toString("base64"),
  ciphertext: encrypted.toString("base64"),
}, null, 2)}\n`);

console.log(`Encrypted ${path.relative(root, inputPath)} -> ${path.relative(root, outputPath)}`);
