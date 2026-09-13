/**
 * A saved brand identity the creative tools can fold into their prompts.
 * Lives inside the `image` settings column (no migration) and is applied
 * client-side at prompt-compile time, so it never changes what a model call
 * costs — only what it asks for.
 */
export interface BrandKit {
  /** Hex colours, primary first (e.g. `#0F172A`). */
  colors: string[];
  /** Font family names, display face first. Advisory for typography prompts. */
  fonts: string[];
  id: string;
  /** Uploaded logo (storage URL). Used as a reference image where a tool supports one. */
  logoUrl?: string;
  name: string;
  /** Free-form art-direction notes: mood, lighting, what to avoid. */
  styleNotes: string;
  /** Voice & tone guidance for scripts and on-screen copy. */
  toneOfVoice: string;
}

export interface UserImageConfig {
  /** `BrandKit.id` currently applied by the brand toolbar action; empty string = none.
   * (Empty string rather than undefined because the settings merge skips undefined,
   * which would make "clear the active kit" a no-op.) */
  activeBrandKitId?: string;
  brandKits?: BrandKit[];
  defaultImageNum: number;
}
