import type { CSSProperties } from "react";

/** The same visual signature is used for discovery and profile matching. */
export function ScoreOrbit({ score }: { score: number }) {
  const value = Math.max(0, Math.min(100, Math.round(score)));
  return (
    <div className="score-orbit" role="img" aria-label={`Adéquation avec votre profil : ${value} sur 100`} style={{ "--score": value } as CSSProperties}>
      <span className="orbit-point orbit-point-one" aria-hidden="true" />
      <span className="orbit-point orbit-point-two" aria-hidden="true" />
      <svg className="score-orbit-ring" viewBox="0 0 172 172" aria-hidden="true">
        <circle cx="86" cy="86" r="82" fill="none" stroke="currentColor" strokeOpacity=".1" strokeWidth="2" />
        <circle className="score-orbit-progress" cx="86" cy="86" r="82" pathLength="100" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
      <span className="score-orbit-core" aria-hidden="true">
        <span className="font-display text-[34px] font-light leading-none tabular-nums sm:text-[58px]">{value}</span>
        <span className="mt-1.5 text-[10px] font-medium tracking-[.08em] text-textSecondary sm:mt-2 sm:text-[11px]">SUR 100</span>
      </span>
    </div>
  );
}
