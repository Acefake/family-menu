# 家庭菜单

一家人一起点菜、买菜的微信小程序。uniapp（Vue 3 + TS + Vite）+ uniCloud 支付宝云。

设计稿：[家庭菜单 设计稿](https://claude.ai/artifact/Hx6MDyYQWKsFf2c6qWwwH5)（私有，需要分享后他人才能打开）

## 功能（MVP）

- **这顿**：顶部日期条 + 早/午/晚饭，每位家人各自点想吃的菜，同一天同一顿自动合成一张单（标出谁想吃）；有人确认后可备菜，吃完「记下这餐」，只算做了的菜
- **点菜**：从「这顿」进入，左分类右菜品，只提交自己的那份，不动别人点的
- **菜谱**：菜名、照片、分类、标签、食材、做法；搜索，按常吃 / 很久没吃 / 没做过筛选；一键导入家常菜
- **买菜**：把今天起 1 / 3 / 7 天里没开饭的菜合并成一张清单，勾选已买、标记「家里有」，可复制或分享给家人
- **饮食日记**：按月回看开过饭的每一顿：谁点的、做了什么、评分、整桌照
- **家庭组**：创建家庭，通过邀请码或分享卡片让家人加入

界面和流程参考了开源项目[拿手菜小本本](https://github.com/lazul1te/Xiaoliang_Kitchen)与[食愿小灶](https://github.com/pydaxing/shiyuan)，配色和版式自绘，没有使用它们的图片素材。

## 目录

```
src/
  pages/            today 这顿 / dishes 菜谱 / shopping 买菜 / mine 我的（四个 Tab）；order 点菜 / serve 记下这餐 / diary 饮食日记 / dish 详情+编辑
  api/menu.ts       云对象 menu-co 的类型化封装
  stores/session.ts 登录态、当前家庭、当前餐次（Pinia）
  composables/      usePageData：页面 onShow 时登录 → 检查家庭 → 加载
  components/       DishThumb、StateView、NoFamily
  styles/base.scss  设计 tokens（CSS 变量）
uniCloud-alipay/
  database/         fm-user / fm-family / fm-dish / fm-menu（每顿一条：各人点的菜、确认状态、开饭记录）的 schema 与索引（客户端无直接权限）
  cloudfunctions/
    menu-co/        云对象：登录、家庭、菜谱、菜单、采购清单
    common/fm-common/ 公共模块：配置读取、令牌签发校验、微信 code2Session
```

所有数据读写都经过云对象 `menu-co`，它按登录用户所属的家庭做隔离；数据库 schema 对客户端全部关闭。

## 开始

```bash
pnpm install
pnpm dev          # 编译到 dist/dev/mp-weixin，用微信开发者工具导入该目录
pnpm build        # 生产包 dist/build/mp-weixin
pnpm check        # typecheck + eslint + prettier
```

> 命令行 `pnpm dev` 只编译前端，不会注入 uniCloud 服务空间信息；联调云端请在 HBuilderX 里「运行到小程序模拟器 → 微信开发者工具」。

### 首次接入 uniCloud（需要你的 DCloud 账号）

1. 在 [uniCloud 控制台](https://unicloud.dcloud.net.cn) 创建支付宝云服务空间（可选免费版，注意每月续期）。
2. 用 HBuilderX 打开本项目根目录，右键 `uniCloud-alipay` → 关联云服务空间。
3. 复制 `uniCloud-alipay/cloudfunctions/common/fm-common/config.example.json` 为同目录 `config.json`，填写：
   - `weixin.appid` / `weixin.appsecret`：微信公众平台 → 开发管理 → 开发设置
   - `tokenSecret`：一串随机字符串（≥16 位）
   - `ai.apiKey`（可选，快捷录入菜谱、AI 生成菜品图片用）：[智谱开放平台](https://bigmodel.cn) 注册后创建 API Key，`glm-4-flash`（文字）和 `cogview-3-flash`（图片）目前免费，以平台当前定价为准；可用 `ai.model` / `ai.imageModel` 换模型（免费的 `cogview-3-flash` 出图质量一般，想要更好的可换 `cogview-4-250304`，需付费，先看平台定价）
     `config.json` 已被 gitignore，不要提交。
4. 右键 `common/fm-common` → 上传公共模块；右键 `menu-co` → 管理公共模块依赖确认包含 fm-common → 上传部署。
5. 右键 `database` → 初始化云数据库（创建 4 张表及索引）。
6. 在 `src/manifest.json` 的 `mp-weixin.appid` 填入小程序 AppID。
7. 微信公众平台 → 开发设置 → 服务器域名：按 uniCloud 文档添加支付宝云服务空间的 request / uploadFile 域名。

### 上线前

- 个人主体小程序也需要先完成**小程序备案**再提审。
- 服务空间选免费版的话，记得在到期前续期，否则会被释放。

## 后续

- 「今天吃什么」推荐排除最近 N 天吃过的
- 忌口与口味偏好
- 历史菜单、常吃排行
- 订阅消息提醒
