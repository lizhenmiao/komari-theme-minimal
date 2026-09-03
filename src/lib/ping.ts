/**
 * 探测任务的适用性判定。
 *
 * 运营者可以给每个任务指定它适用哪些节点。不做这层过滤的话，没配探测的节点
 * 也会显示一排空药丸，把「这台没配探测」说成了「探测还没跑出结果」。
 */

import type { PingTask } from './types'

/**
 * 这个任务是否适用于该节点。
 *
 * 注意与服务端 `AppliesToClient`（database/models/pingTask.go:27）的一处差异：
 * 服务端对空列表返回 false，这里返回 true。
 *
 * 服务端拿到的是数据库里的完整记录，空列表确实意味着「不适用任何节点」。
 * 而主题面对的可能是不下发这个字段的老版本服务端，此时按「不适用」处理会把
 * 延迟展示整个关掉 —— 宁可多显示，不可静默丢功能。
 */
export function taskAppliesTo(task: PingTask, uuid: string): boolean {
  if (!task.clients || task.clients.length === 0) return true
  return task.clients.includes(uuid)
}

/** 某个节点适用的任务子集。 */
export function tasksFor(tasks: PingTask[], uuid: string): PingTask[] {
  return tasks.filter((task) => taskAppliesTo(task, uuid))
}
