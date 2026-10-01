/**
 * Build a multipart/form-data body that contains the supplied text
 * fields followed by one binary file part. Pure function — exported
 * for testing.
 *
 * @deprecated Send helpers move to feed-publisher
 * (`telegram/infrastructure/bot-api/build-multipart-body.ts`) via the
 * telegram-bots-gateway (todo 5); removed at the global cutover
 * (gateway todo 7). Do not extend.
 */
export function buildMultipartBody(
  boundary: string,
  textFields: ReadonlyArray<readonly [string, string]>,
  file: {
    fieldName: string;
    fileName: string;
    mimeType: string;
    bytes: Buffer;
  },
): Buffer {
  const parts: Buffer[] = [];
  const CRLF = '\r\n';

  for (const [name, value] of textFields) {
    parts.push(
      Buffer.from(
        `--${boundary}${CRLF}` +
          `Content-Disposition: form-data; name="${name}"${CRLF}${CRLF}` +
          `${value}${CRLF}`,
      ),
    );
  }

  parts.push(
    Buffer.from(
      `--${boundary}${CRLF}` +
        `Content-Disposition: form-data; name="${file.fieldName}"; filename="${file.fileName}"${CRLF}` +
        `Content-Type: ${file.mimeType}${CRLF}${CRLF}`,
    ),
  );
  parts.push(file.bytes);
  parts.push(Buffer.from(`${CRLF}--${boundary}--${CRLF}`));

  return Buffer.concat(parts);
}

export function buildMediaGroupMultipartBody(
  boundary: string,
  textFields: ReadonlyArray<readonly [string, string]>,
  files: ReadonlyArray<{
    fieldName: string;
    fileName: string;
    mimeType: string;
    bytes: Buffer;
  }>,
): Buffer {
  const parts: Buffer[] = [];
  const CRLF = '\r\n';

  for (const [name, value] of textFields) {
    parts.push(
      Buffer.from(
        `--${boundary}${CRLF}` +
          `Content-Disposition: form-data; name="${name}"${CRLF}${CRLF}` +
          `${value}${CRLF}`,
      ),
    );
  }

  for (const file of files) {
    parts.push(
      Buffer.from(
        `--${boundary}${CRLF}` +
          `Content-Disposition: form-data; name="${file.fieldName}"; filename="${file.fileName}"${CRLF}` +
          `Content-Type: ${file.mimeType}${CRLF}${CRLF}`,
      ),
    );
    parts.push(file.bytes);
    parts.push(Buffer.from(CRLF));
  }

  parts.push(Buffer.from(`--${boundary}--${CRLF}`));

  return Buffer.concat(parts);
}
