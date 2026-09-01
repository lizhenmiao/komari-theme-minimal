/**
 * 在线状态点。在线是呼吸水波纹，离线是静态实心点 —— 死掉的节点不该看起来
 * 还活着。
 */

interface StatusDotProps {
  online: boolean
}

export default function StatusDot({ online }: StatusDotProps) {
  return (
    <span
      className={`km-dot km-ui-status-dot ${
        online ? 'km-dot-live bg-emerald-500' : 'bg-rose-500'
      }`}
    />
  )
}
