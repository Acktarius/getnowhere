export type SmartNode = {
  id: string;
  url: string;
  name?: string;
  poolHost: string;
  poolStartTime?: string;
  poolUptimePercent?: number;
  feeAddress?: string;
  height?: number;
  isActive?: boolean;
};
