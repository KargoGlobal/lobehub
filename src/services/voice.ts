import debug from 'debug';

import { lambdaClient } from '@/libs/trpc/client';
import { type GenerateVoiceInput } from '@/server/routers/lambda/voice';

const log = debug('lobe-voice:service');

export interface GeneratedAudio {
  fileId: string;
  kind: GenerateVoiceInput['kind'];
  size: number;
  url: string;
}

export class VoiceService {
  async generate(payload: GenerateVoiceInput): Promise<GeneratedAudio> {
    log('Generating %s audio with %s', payload.kind, payload.model);
    return lambdaClient.voice.generate.mutate(payload);
  }
}

export const voiceService = new VoiceService();
