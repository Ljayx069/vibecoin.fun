import { z } from "zod";

const b58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const httpUrl = z.string().url().refine((u) => u.startsWith("http://") || u.startsWith("https://"), {
  message: "must be an http(s) url",
});

export const launchRecordSchema = z.object({
  mint: z.string().regex(b58, "mint must be a base58 Solana address"),
  name: z.string().min(1).max(32),
  symbol: z.string().min(1).max(10),
  description: z.string().max(1200),
  image: httpUrl.optional(),
  github: httpUrl.optional(),
  website: httpUrl.optional(),
  creator: z.string().regex(b58, "creator must be a base58 Solana address"),
  wallet: z.string().max(64).optional(),
  signature: z.string().max(120),
  createdAt: z.string().datetime(),
});

export type LaunchRecord = z.infer<typeof launchRecordSchema>;

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"] as const;
export const MAX_IMAGE_BYTES = 1.5 * 1024 * 1024;

export const metadataPayloadSchema = z
  .object({
    name: z.string().min(1).max(32),
    symbol: z.string().min(1).max(10),
    description: z.string().max(1200),
    website: httpUrl.optional(),
    twitter: z.string().max(200).optional(),
    telegram: z.string().max(200).optional(),
    github: httpUrl.optional(),
    imageBase64: z.string().optional(),
    imageContentType: z.enum(IMAGE_TYPES).optional(),
  })
  .refine((v) => !v.imageBase64 || v.imageContentType, {
    message: "imageContentType is required when imageBase64 is set",
  })
  .refine((v) => !v.imageBase64 || v.imageBase64.length <= (MAX_IMAGE_BYTES * 4) / 3 + 4, {
    message: "image exceeds the 1.5MB limit",
  });

export type MetadataPayload = z.infer<typeof metadataPayloadSchema>;

export function validateLaunch(body: unknown): LaunchRecord {
  return launchRecordSchema.parse(body);
}

export function validateMetadata(body: unknown): MetadataPayload {
  return metadataPayloadSchema.parse(body);
}
