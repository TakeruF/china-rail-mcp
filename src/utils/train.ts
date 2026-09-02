import type { TrainType } from '../domain/train.js';

const labels: Record<TrainType, string> = {
  G: '高速动车组列车',
  D: '动车组列车',
  C: '城际动车组列车',
  S: '市郊列车',
  Z: '直达特快列车',
  T: '特快列车',
  K: '快速列车',
  L: '临时旅客列车',
  Y: '旅游列车',
  OTHER: '其他列车',
};

const knownPrefixes = new Set<TrainType>(['G', 'D', 'C', 'S', 'Z', 'T', 'K', 'L', 'Y']);

export function classifyTrainNumber(trainNumber: string): {
  trainType: TrainType;
  trainTypeLabel: string;
  upstreamTrainType?: string;
} {
  const prefix = trainNumber.trim().charAt(0).toUpperCase();
  const trainType: TrainType = knownPrefixes.has(prefix as TrainType)
    ? (prefix as TrainType)
    : 'OTHER';
  return {
    trainType,
    trainTypeLabel: labels[trainType],
    ...(trainType === 'OTHER' && prefix ? { upstreamTrainType: prefix } : {}),
  };
}
