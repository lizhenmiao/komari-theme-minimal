/**
 * 首屏骨架。
 *
 * 数据到达前给出页面的形状，而不是一行「加载中」—— 后者会让人以为页面是空的。
 * 尺寸刻意贴近真实卡片，数据到达时不会跳一下。
 */

interface SkeletonProps {
  /** 骨架卡数量。默认 6 张，1600px 下四列，撑满一行半。 */
  count?: number
}

/** 灰块。宽度由调用方给，因为每处要模拟的内容宽度不同。 */
function Block({ className = '' }: { className?: string }) {
  return <span className={`km-skeleton block ${className}`} />
}

/** 一条仪表条骨架：标签、槽、下方两个数值。 */
function BarBlock() {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <Block className="h-3 w-10" />
        <Block className="h-3 w-8" />
      </div>
      <Block className="mt-1 h-2.5 w-full rounded-[3px]" />
      <div className="mt-1 flex items-baseline justify-between">
        <Block className="h-2.5 w-12" />
        <Block className="h-2.5 w-10" />
      </div>
    </div>
  )
}

/**
 * 节点卡骨架。分块与真实卡片一致：卡头、规格、四条仪表条、趋势图、两组数值。
 *
 * 刻意不用 `km-node-card`：那是真实卡片的测试锚点，校验脚本靠它数卡片数量。
 * 骨架冒用的话，「渲染出 N 张卡片」会把骨架算进去，加载中的页面也能通过。
 */
export function SkeletonCard() {
  return (
    <article className="km-skeleton-card km-card flex flex-col p-3.5" aria-hidden="true">
      <div className="flex items-center gap-2">
        <Block className="size-[15px] rounded-[2px]" />
        <Block className="size-[15px] rounded-full" />
        <Block className="size-2 rounded-full" />
        <Block className="ml-1 h-4 w-28" />
      </div>
      <Block className="mt-2 h-3 w-3/4" />

      <div className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-2">
        <BarBlock />
        <BarBlock />
        <BarBlock />
        <BarBlock />
      </div>

      <Block className="mt-2.5 h-10 w-full rounded-md" />

      <div className="mt-2.5 grid grid-cols-2 gap-x-4 border-t km-hair pt-2">
        <div>
          <Block className="h-2.5 w-16" />
          <Block className="mt-1.5 h-3.5 w-24" />
        </div>
        <div>
          <Block className="h-2.5 w-16" />
          <Block className="mt-1.5 h-3.5 w-24" />
        </div>
      </div>

      <div className="mt-2.5 flex items-center justify-between border-t km-hair pt-2">
        <Block className="h-3 w-28" />
        <Block className="h-3 w-20" />
      </div>
    </article>
  )
}

/**
 * 卡片网格骨架。列数规则与真实网格一致，加载完成不会重排。
 *
 * 同样避开 `km-index-grid` 锚点，理由见 SkeletonCard。
 */
export function SkeletonGrid({ count = 6 }: SkeletonProps) {
  return (
    <section
      className="km-skeleton-grid grid gap-3"
      style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(370px, 100%), 1fr))' }}
    >
      {Array.from({ length: count }, (_, index) => (
        <SkeletonCard key={index} />
      ))}
    </section>
  )
}

/** 表格骨架。列宽不必与真实表格对齐，行高一致就够。 */
export function SkeletonTable({ count = 6 }: SkeletonProps) {
  return (
    <div className="km-skeleton-table km-card overflow-hidden" aria-hidden="true">
      <div className="flex items-center justify-between border-b km-hair px-4 py-2">
        <Block className="h-3 w-12" />
        <Block className="size-8 rounded-lg" />
      </div>
      <div className="divide-y divide-km-hair">
        {Array.from({ length: count }, (_, index) => (
          <div key={index} className="flex items-center gap-4 px-4 py-3.5">
            <Block className="size-[15px] rounded-[2px]" />
            <Block className="h-4 w-32" />
            <Block className="h-2.5 w-24" />
            <Block className="ml-auto h-2.5 w-16" />
            <Block className="h-2.5 w-16" />
            <Block className="h-2.5 w-20" />
          </div>
        ))}
      </div>
    </div>
  )
}

/** 汇总条里的数值骨架，四格共用。 */
export function SkeletonValue() {
  return <Block className="mt-1 h-[22px] w-20" />
}
