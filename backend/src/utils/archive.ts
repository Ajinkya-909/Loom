import archiver from 'archiver';

/**
 * Factory for creating zip archives across CJS / ESM / Archiver v7 module formats.
 */
export function createZipArchive(options?: archiver.ArchiverOptions): archiver.Archiver {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require('archiver');
  if (typeof mod === 'function') {
    return mod('zip', options);
  }
  if (mod.ZipArchive) {
    return new mod.ZipArchive(options);
  }
  if (mod.default && typeof mod.default === 'function') {
    return mod.default('zip', options);
  }
  if (typeof (archiver as any) === 'function') {
    return (archiver as any)('zip', options);
  }
  throw new Error('Unsupported archiver module structure');
}
