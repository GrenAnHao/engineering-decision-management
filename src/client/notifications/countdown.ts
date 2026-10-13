/** 可暂停的倒计时：只记录时间点，不持有定时器，方便脱离 React 单测 */
export type Countdown = {
  /** 剩余毫秒数，不会小于 0 */
  remaining: (now: number) => number;
  /** 暂停；已暂停时无效果 */
  pause: (now: number) => void;
  /** 继续；正在计时时无效果 */
  resume: (now: number) => void;
};

/** 创建时立即开始计时 */
export function createCountdown(totalMs: number, now: number): Countdown {
  let left = totalMs;
  let runningSince: number | null = now;

  const remaining = (at: number) => (runningSince === null ? left : Math.max(0, left - (at - runningSince)));

  return {
    remaining,
    pause(at) {
      if (runningSince === null) return;
      left = remaining(at);
      runningSince = null;
    },
    resume(at) {
      if (runningSince !== null) return;
      runningSince = at;
    },
  };
}
