declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    ARCHIVE_IMPORT_TOKEN?: string;
  }
}
