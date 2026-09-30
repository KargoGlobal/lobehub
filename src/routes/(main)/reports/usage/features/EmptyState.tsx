import { Empty } from '@lobehub/ui';
import { SearchXIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

const EmptyState = memo(() => {
  const { t } = useTranslation('usageReport');
  return (
    <Empty
      description={t('empty.desc')}
      icon={SearchXIcon}
      style={{ paddingBlock: 24 }}
      title={t('empty.title')}
    />
  );
});

EmptyState.displayName = 'UsageReportEmptyState';

export default EmptyState;
