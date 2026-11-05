// Acceso al almacenamiento S3 (MinIO en local, R2 en producción).
// Todo el acceso a archivos pasa por aquí.

import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListPartsCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"

export const BUCKET_ORIGINALS = process.env.S3_BUCKET_ORIGINALS ?? "creative-originals"
export const BUCKET_DERIVED = process.env.S3_BUCKET_DERIVED ?? "creative-derived"

function makeClient(endpoint: string | undefined) {
  return new S3Client({
    endpoint,
    region: process.env.S3_REGION ?? "us-east-1",
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
    },
    // MinIO/R2 no necesitan los checksums nuevos del SDK y rompen las URLs firmadas.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  })
}

/** Cliente para llamadas servidor → S3. */
export const s3 = makeClient(process.env.S3_ENDPOINT)
/** Cliente solo para firmar URLs que abrirá el navegador. */
const s3Public = makeClient(process.env.S3_PUBLIC_ENDPOINT ?? process.env.S3_ENDPOINT)

const TTL = 60 * 60 // 1 h

export function originalKey(assetCode: string, versionCode: string, fileName: string) {
  const ext = fileName.includes(".") ? fileName.split(".").pop()!.toLowerCase() : "bin"
  return `${assetCode}/${versionCode}/original.${ext}`
}

export async function createMultipart(key: string, contentType: string) {
  const res = await s3.send(
    new CreateMultipartUploadCommand({ Bucket: BUCKET_ORIGINALS, Key: key, ContentType: contentType }),
  )
  return res.UploadId!
}

export function signPart(key: string, uploadId: string, partNumber: number) {
  return getSignedUrl(
    s3Public,
    new UploadPartCommand({ Bucket: BUCKET_ORIGINALS, Key: key, UploadId: uploadId, PartNumber: partNumber }),
    { expiresIn: TTL },
  )
}

/**
 * Partes ya subidas. `Size` es opcional a propósito: MinIO lo devuelve y
 * Supabase no. Quien lo necesite tiene que contar con que falte.
 */
export async function listParts(key: string, uploadId: string) {
  const parts: { PartNumber: number; Size: number | null; ETag: string }[] = []
  let marker: string | undefined
  do {
    const res = await s3.send(
      new ListPartsCommand({ Bucket: BUCKET_ORIGINALS, Key: key, UploadId: uploadId, PartNumberMarker: marker }),
    )
    for (const p of res.Parts ?? [])
      parts.push({ PartNumber: p.PartNumber!, Size: p.Size ?? null, ETag: p.ETag! })
    marker = res.IsTruncated ? res.NextPartNumberMarker : undefined
  } while (marker)
  return parts
}

/** Tamaño real del objeto ya subido, para verificar una subida por partes. */
export async function objectSize(bucket: string, key: string) {
  const res = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
  return res.ContentLength ?? null
}

export async function deleteObject(bucket: string, key: string) {
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
}

export async function completeMultipart(
  key: string,
  uploadId: string,
  parts: { PartNumber: number; ETag: string }[],
) {
  await s3.send(
    new CompleteMultipartUploadCommand({
      Bucket: BUCKET_ORIGINALS,
      Key: key,
      UploadId: uploadId,
      MultipartUpload: { Parts: [...parts].sort((a, b) => a.PartNumber - b.PartNumber) },
    }),
  )
}

export async function abortMultipart(key: string, uploadId: string) {
  await s3.send(new AbortMultipartUploadCommand({ Bucket: BUCKET_ORIGINALS, Key: key, UploadId: uploadId }))
}

export function signedGetUrl(bucket: string, key: string, downloadName?: string) {
  return getSignedUrl(
    s3Public,
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      ResponseContentDisposition: downloadName
        ? `attachment; filename="${downloadName.replace(/"/g, "")}"`
        : undefined,
    }),
    { expiresIn: TTL },
  )
}

export async function putObject(bucket: string, key: string, body: Buffer | Uint8Array, contentType: string) {
  await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }))
}

export async function getObjectStream(bucket: string, key: string) {
  const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
  return res.Body as NodeJS.ReadableStream
}
