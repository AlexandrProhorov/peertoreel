import type { StoryboardStyle } from '@peertoreel/contracts';
import { Img } from 'remotion';
import { assetUrl, resolveAssetKey } from '../../assets.js';

/**
 * Local subject asset (`image` / `subject`). The key is validated by the
 * contract; `resolveAssetKey` still rejects unsafe paths, so a bad key fails
 * loudly instead of producing an empty frame.
 */
export function SubjectLayer({
  assetKey,
  progress,
  opacity,
  style,
  widthPercent,
}: {
  assetKey: string;
  progress: number;
  opacity: number;
  style: StoryboardStyle;
  widthPercent: number;
}) {
  const location = resolveAssetKey(assetKey);
  const scale = 0.9 + Math.min(1, Math.max(0, progress)) * 0.1;

  return (
    <div
      style={{
        position: 'relative',
        width: `${widthPercent}%`,
        opacity,
        transform: `scale(${scale})`,
        filter: `drop-shadow(0 26px 30px rgba(0,0,0,0.45)) drop-shadow(0 0 30px ${style.palette.accent}22)`,
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: '-12%',
          borderRadius: '50%',
          background: `radial-gradient(circle, ${style.palette.text}16, transparent 68%)`,
        }}
      />
      <Img
        src={assetUrl(location)}
        style={{
          position: 'relative',
          display: 'block',
          width: '100%',
          height: 'auto',
        }}
      />
    </div>
  );
}
