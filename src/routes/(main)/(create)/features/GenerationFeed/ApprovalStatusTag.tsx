'use client';

import { type DropdownItem, DropdownMenu, Icon, type MenuInfo } from '@lobehub/ui';
import { Tag } from '@lobehub/ui/base-ui';
import { cssVar } from 'antd-style';
import { CheckIcon, CircleDashedIcon, PencilLineIcon } from 'lucide-react';
import { memo, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { GenerationBatchApprovalStatus } from '@/types/generation';

const STATUS_OPTIONS: GenerationBatchApprovalStatus[] = ['pending', 'approved', 'changesRequested'];

const STATUS_ICON: Record<GenerationBatchApprovalStatus, typeof CheckIcon> = {
  approved: CheckIcon,
  changesRequested: PencilLineIcon,
  pending: CircleDashedIcon,
};

const STATUS_TAG_COLOR: Record<GenerationBatchApprovalStatus, 'success' | 'warning' | undefined> = {
  approved: 'success',
  changesRequested: 'warning',
  pending: undefined,
};

interface ApprovalStatusTagProps {
  /** Disables the dropdown (still renders the badge) while a change is in flight. */
  disabled?: boolean;
  onChange: (next: GenerationBatchApprovalStatus) => void;
  status: GenerationBatchApprovalStatus;
}

/**
 * Review-status badge for a generation batch, doubling as the control to
 * change it — same "clickable Tag + DropdownMenu" shape as
 * `TaskVisibilityTag`. Lives here (not under `image/` or `video/`) because
 * both feeds render the same batch-level status.
 */
export const ApprovalStatusTag = memo<ApprovalStatusTagProps>(({ disabled, onChange, status }) => {
  const { t } = useTranslation('image');
  const [open, setOpen] = useState(false);

  const handleChange = useCallback(
    (next: GenerationBatchApprovalStatus) => {
      if (next === status) return;
      onChange(next);
    },
    [onChange, status],
  );

  const menuItems = useMemo<DropdownItem[]>(
    () =>
      STATUS_OPTIONS.map((option) => {
        const OptionIcon = STATUS_ICON[option];
        const isCurrent = option === status;
        return {
          icon: <Icon color={cssVar.colorTextSecondary} icon={OptionIcon} size={16} />,
          key: option,
          label: t(`generation.approval.${option}`),
          extra: isCurrent ? (
            <Icon color={cssVar.colorTextSecondary} icon={CheckIcon} size={14} />
          ) : undefined,
          onClick: ({ domEvent }: MenuInfo) => {
            domEvent.stopPropagation();
            handleChange(option);
          },
        };
      }),
    [handleChange, status, t],
  );

  const StatusIcon = STATUS_ICON[status];

  const trigger = (
    <Tag
      color={STATUS_TAG_COLOR[status]}
      data-testid={'approval-status-tag'}
      icon={<StatusIcon size={12} />}
      title={t('generation.approval.label')}
      variant={'borderless'}
    >
      {t(`generation.approval.${status}`)}
    </Tag>
  );

  if (disabled) return trigger;

  return (
    <DropdownMenu items={menuItems} open={open} onOpenChange={setOpen}>
      <span style={{ cursor: 'pointer' }} onClick={(e) => e.stopPropagation()}>
        {trigger}
      </span>
    </DropdownMenu>
  );
});

ApprovalStatusTag.displayName = 'ApprovalStatusTag';
