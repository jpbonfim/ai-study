import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import busboy from 'busboy';

export class PayloadTooLargeError extends Error {}
export class MalformedFormError extends Error {}

export interface ReceivedForm {
  fields: Record<string, string>;
  /** Uploaded files by field name, streamed to `tempDir`. */
  files: Record<string, { path: string; size: number }>;
}

/**
 * Streams a multipart/form-data request to disk (constant memory). Files larger than
 * `maxFileBytes` abort the upload with `PayloadTooLargeError`.
 */
export async function receiveMultipart(request: Request, tempDir: string, maxFileBytes: number): Promise<ReceivedForm> {
  const contentType = request.headers.get('content-type') || '';
  if (!contentType.includes('multipart/form-data') || !request.body) {
    throw new MalformedFormError('Requisição sem formulário multipart.');
  }

  const parser = busboy({ headers: { 'content-type': contentType }, limits: { fileSize: maxFileBytes, files: 4 } });
  const form: ReceivedForm = { fields: {}, files: {} };
  const writes: Promise<void>[] = [];
  let tooLarge = false;

  parser.on('field', (name, value) => {
    form.fields[name] = value;
  });
  parser.on('file', (name, stream) => {
    const target = path.join(tempDir, `upload-${Object.keys(form.files).length}-${name.replace(/[^a-z0-9_-]/gi, '')}`);
    const entry = { path: target, size: 0 };
    form.files[name] = entry;
    stream.on('data', (chunk: Buffer) => {
      entry.size += chunk.length;
    });
    stream.on('limit', () => {
      tooLarge = true;
    });
    writes.push(pipeline(stream, fs.createWriteStream(target)));
  });

  try {
    await pipeline(Readable.fromWeb(request.body as import('node:stream/web').ReadableStream), parser);
    await Promise.all(writes);
  } catch (err) {
    if (tooLarge) throw new PayloadTooLargeError();
    throw new MalformedFormError(err instanceof Error ? err.message : 'Formulário inválido.');
  }
  if (tooLarge) throw new PayloadTooLargeError();
  return form;
}
