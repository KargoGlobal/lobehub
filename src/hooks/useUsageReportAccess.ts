import { useClientDataSWR } from '@/libs/swr';
import { usageReportKeys } from '@/libs/swr/keys';
import { usageReportService } from '@/services/usageReport';

export const useUsageReportAccess = () => {
  const { data, isLoading } = useClientDataSWR(
    usageReportKeys.access(),
    () => usageReportService.access(),
    {
      revalidateOnFocus: false,
      shouldRetryOnError: false,
    },
  );
  return { allowed: data?.allowed === true, isLoading };
};
