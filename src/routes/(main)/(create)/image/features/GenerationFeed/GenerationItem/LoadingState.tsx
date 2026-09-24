'use client';

import { Block, Center } from '@lobehub/ui';
import React, { memo } from 'react';

import NeuralNetworkLoading from '@/components/NeuralNetworkLoading';
import { AsyncTaskStatus } from '@/types/asyncTask';

import { ActionButtons } from './ActionButtons';
import { ElapsedTime } from './ElapsedTime';
import { RemainingTime } from './RemainingTime';
import { styles } from './styles';
import { type LoadingStateProps } from './types';
import { useEstimatedRemainingMs } from './useEstimatedRemainingMs';
import { getThumbnailMaxWidth } from './utils';

// Loading state component
export const LoadingState = memo<LoadingStateProps>(
  ({ generation, generationBatch, aspectRatio, onCancel, onDelete }) => {
    const isGenerating =
      generation.task.status === AsyncTaskStatus.Processing ||
      generation.task.status === AsyncTaskStatus.Pending;

    // "~Ns left" while an estimate is available and not yet exceeded; once it
    // runs out (or no model history exists yet) fall back to the count-up.
    const remainingMs = useEstimatedRemainingMs(
      generation.id,
      generationBatch.avgLatencyMs,
      isGenerating,
    );

    return (
      <Block
        align={'center'}
        className={`${styles.placeholderContainer} ${styles.placeholderContainerLoading}`}
        justify={'center'}
        variant={'filled'}
        style={{
          aspectRatio,
          maxWidth: getThumbnailMaxWidth(generation, generationBatch),
        }}
      >
        <div className={`${styles.placeholderContainer} ${styles.placeholderContainerLoading}`} />
        <Center gap={8} style={{ zIndex: 2 }}>
          <NeuralNetworkLoading size={48} />
          {remainingMs ? (
            <RemainingTime ms={remainingMs} />
          ) : (
            <ElapsedTime generationId={generation.id} isActive={isGenerating} />
          )}
        </Center>
        <ActionButtons onCancel={onCancel} onDelete={onDelete} />
      </Block>
    );
  },
);

LoadingState.displayName = 'LoadingState';
