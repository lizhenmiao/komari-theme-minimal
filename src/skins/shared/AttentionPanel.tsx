/**
 * 「需要注意」板块。两套新皮肤共用，形状差异在 skins.css 里。
 *
 * 受 `showAttention` 控制 —— 这里只负责渲染，开关判断在各皮肤的 IndexView 里，
 * 免得「传了却不显示」这种费解的调用。
 */

import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { issueText, uptimeUnits } from './text'
import { nodeFacts } from './nodeFacts'
import type { AttentionEntry } from '../../lib/attention'

export default function AttentionPanel({ entries }: { entries: AttentionEntry[] }) {
  const { t } = useTranslation()
  const units = uptimeUnits(t)

  if (entries.length === 0) return null

  return (
    <section className="km-index-attention km-s-card mb-4 overflow-hidden" aria-live="polite">
      <h2 className="border-b km-hair px-4 py-2.5 text-[13px] font-semibold">
        {t('attention.title')}
        <span className="km-s-num ml-2 font-normal text-km-faint">{entries.length}</span>
      </h2>
      <ul>
        {entries.map((entry) => {
          const facts = nodeFacts(entry.node)
          return (
            <li key={entry.node.client.uuid} className="border-t km-hair first:border-t-0">
              <Link
                to={`/instance/${entry.node.client.uuid}`}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5
                  transition-colors hover:bg-km-panel2"
              >
                <span
                  className={`size-2 shrink-0 rounded-full ${
                    entry.level === 'bad' ? 'bg-km-bad' : 'bg-km-warn'
                  }`}
                  aria-hidden="true"
                />
                <b className="truncate text-[14px] font-semibold">{entry.node.client.name}</b>
                <span className="truncate text-[13px] text-km-dim">
                  {entry.issues.map((issue) => issueText(t, issue, facts, units)).join('，')}
                </span>
                <span className="ml-auto shrink-0 text-[12px] text-km-faint">
                  {entry.node.client.group?.trim() || ''}
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
