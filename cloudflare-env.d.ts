declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    MODEL_API_KEY?: string;
    MUSE_MODEL?: string;
    GITHUB_TOKEN?: string;
    SCREENSHOT_API_KEY?: string;
    BUFFER_API_KEY?: string;
    BUFFER_OWNER_ID?: string;
  }
}
