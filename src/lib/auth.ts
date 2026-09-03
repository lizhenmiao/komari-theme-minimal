/**
 * 访客身份到导航栏入口的映射。
 *
 * 三态而不是布尔：`viewer === null` 是「还没问到」，和「问到了且未登录」不是
 * 一回事。前者不该显示任何入口 —— 先给未登录的人看到登录、拿到身份后再换成
 * 后台，界面会闪一下。
 */

import type { Viewer } from './types'

export type AuthEntry = 'admin' | 'login' | 'none'

export function authEntryOf(viewer: Viewer | null): AuthEntry {
  if (viewer === null) return 'none'
  return viewer.logged_in ? 'admin' : 'login'
}
