declare module "virtual:template" {
  /** Files under template/, embedded at build time. `content: null` marks an empty folder. */
  export const TEMPLATE_FILES: { path: string; content: string | null }[];
}
