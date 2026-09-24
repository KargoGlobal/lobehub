'use client';

import { LoadingOutlined } from '@ant-design/icons';
import { Block, Center } from '@lobehub/ui';
import { Progress, Spin } from 'antd';
import { memo } from 'react';

import { ActionButtons } from '@/routes/(main)/(create)/image/features/GenerationFeed/GenerationItem/ActionButtons';
import { ElapsedTime } from '@/routes/(main)/(create)/image/features/GenerationFeed/GenerationItem/ElapsedTime';
import { RemainingTime } from '@/routes/(main)/(create)/image/features/GenerationFeed/GenerationItem/RemainingTime';
import { styles } from '@/routes/(main)/(create)/image/features/GenerationFeed/GenerationItem/styles';
import { useEstimatedRemainingMs } from '@/routes/(main)/(create)/image/features/GenerationFeed/GenerationItem/useEstimatedRemainingMs';
import { AsyncTaskStatus } from '@/types/asyncTask';
import type { Generation } from '@/types/generation';

import { DEFAULT_AVG_LATENCY_MS, useEstimatedProgress } from './useEstimatedProgress';

interface VideoLoadingItemProps {
  aspectRatio?: string;
  avgLatencyMs?: number | null;
  generation: Generation;
  onCancel: () => void;
  onDelete: () => void;
}

const VideoLoadingItem = memo<VideoLoadingItemProps>(
  ({ generation, aspectRatio, avgLatencyMs, onCancel, onDelete }) => {
    const latency = avgLatencyMs && avgLatencyMs > 0 ? avgLatencyMs : DEFAULT_AVG_LATENCY_MS;
    const isGenerating =
      generation.task.status === AsyncTaskStatus.Processing ||
      generation.task.status === AsyncTaskStatus.Pending;

    const progress = useEstimatedProgress(generation.id, latency, isGenerating);
    const remainingMs = useEstimatedRemainingMs(generation.id, latency, isGenerating);

    // Below the 99% cap, show "~Ns left" next to the circle; once the circle
    // maxes out (estimate exceeded), fall back to the count-up like image does.
    const showRemainingText = progress !== null && progress < 99 && Boolean(remainingMs);

    return (
      <Block
        align={'center'}
        className={styles.placeholderContainer}
        justify={'center'}
        variant={'filled'}
        style={{
          aspectRatio: aspectRatio?.includes(':') ? aspectRatio.replace(':', '/') : '16/9',
          maxHeight: '50vh',
        }}
      >
        <Center gap={8}>
          {progress !== null ? (
            <Progress percent={progress} size={48} type="circle" />
          ) : (
            <Spin indicator={<LoadingOutlined spin />} />
          )}
          {showRemainingText && <RemainingTime ms={remainingMs!} />}
          {progress === 99 && <ElapsedTime generationId={generation.id} isActive={isGenerating} />}
        </Center>
        <ActionButtons onCancel={onCancel} onDelete={onDelete} />
      </Block>
    );
  },
);

VideoLoadingItem.displayName = 'VideoLoadingItem';

export default VideoLoadingItem;
