const TABS = [
  { path: '/pages/today/index', text: '这顿', icon: '/static/tabbar/today.png', activeIcon: '/static/tabbar/today-active.png' },
  { path: '/pages/dishes/index', text: '菜谱', icon: '/static/tabbar/dishes.png', activeIcon: '/static/tabbar/dishes-active.png' },
  { path: '/pages/shopping/index', text: '买菜', icon: '/static/tabbar/shopping.png', activeIcon: '/static/tabbar/shopping-active.png' },
  { path: '/pages/mine/index', text: '我的', icon: '/static/tabbar/mine.png', activeIcon: '/static/tabbar/mine-active.png' },
]

Component({
  data: { list: TABS, selected: 0, badges: ['', '', '', ''] },
  methods: {
    onTap(e) {
      const index = Number(e.currentTarget.dataset.index)
      if (index === this.data.selected) return
      wx.switchTab({ url: TABS[index].path })
    },
  },
})
