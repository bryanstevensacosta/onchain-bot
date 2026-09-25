/**
 * Manual multipart/form-data builders (moved read-only from the
 * backend `build-multipart-body`, Tramo 2 todo 7 — no `form-data`
 * dependency needed).
 */
export interface MultipartFile {
  readonly fieldName: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly bytes: Buffer;
}

export function buildMultipartBody(
  boundary: string,
  textFields: ReadonlyArray<readonly [string, string]>,
  file: MultipartFile,
): Buffer {
  const chunks: Buffer[] = [];
  for (const [name, value] of textFields) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
        'utf8',
      ),
    );
  }
  chunks.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${file.fieldName}"; filename="${file.fileName}"\r\nContent-Type: ${file.mimeType}\r\n\r\n`,
      'utf8',
    ),
  );
  chunks.push(file.bytes);
  chunks.push(Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8'));
  return Buffer.concat(chunks);
}

export function buildMediaGroupMultipartBody(
  boundary: string,
  textFields: ReadonlyArray<readonly [string, string]>,
  files: ReadonlyArray<MultipartFile>,
): Buffer {
  const chunks: Buffer[] = [];
  for (const [name, value] of textFields) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
        'utf8',
      ),
    );
  }
  for (const file of files) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${file.fieldName}"; filename="${file.fileName}"\r\nContent-Type: ${file.mimeType}\r\n\r\n`,
        'utf8',
      ),
    );
    chunks.push(file.bytes);
    chunks.push(Buffer.from('\r\n', 'utf8'));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`, 'utf8'));
  return Buffer.concat(chunks);
}
