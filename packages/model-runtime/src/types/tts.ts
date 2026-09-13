export interface TextToSpeechPayload {
  input: string;
  model: string;
  /**
   * Provider-specific knobs that don't fit the OpenAI-shaped trio above
   * (speed, stability, music length, sound-effect duration...). Providers that
   * don't understand a key ignore it.
   */
  params?: Record<string, unknown>;
  voice: string;
}

export interface TextToSpeechOptions {
  headers?: Record<string, any>;
  signal?: AbortSignal;
  /**
   * userId for the embeddings
   */
  user?: string;
}
