export {}

declare module 'vue' {
  type Hooks = App.AppInstance & Page.PageInstance
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- 合并 uniapp 页面/应用生命周期类型
  interface ComponentCustomOptions extends Hooks {}
}
