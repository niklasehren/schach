import { useEffect, useState } from 'react';
import { analysisQueue, type QueueState } from './queue';

export function useQueueState(): QueueState {
  const [state, setState] = useState(analysisQueue.state);
  useEffect(() => analysisQueue.subscribe(setState), []);
  return state;
}
