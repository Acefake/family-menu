# 家庭菜单

一家人一起点菜、买菜的微信小程序。uniapp（Vue 3 + TS + Vite）+ uniCloud 支付宝云。

设计稿：[家庭菜单 设计稿](https://claude.ai/artifact/Hx6MDyYQWKsFf2c6qWwwH5)（私有，需要分享后他人才能打开）

## 功能（MVP）

- **今日菜单**：按早/午/晚饭查看已点的菜，做好一道勾一道；「随便来一道」从最近没吃的菜里挑
- **点菜**：搜索、按分类筛选，家人点的实时合并到同一份菜单
- **菜谱**：菜名、照片、分类、标签、食材、做法；记录做过几次
- **采购清单**：按菜单自动合并食材，勾选已买，可分享给家人
- **家庭组**：创建家庭，通过邀请码或分享卡片让家人加入

## 目录

```
src/
  pages/            today 今日 / order 点菜 / dishes 菜谱 / mine 我的 / dish 详情+编辑 / shopping 采购清单
  api/menu.ts       云对象 menu-co 的类型化封装
  stores/session.ts 登录态、当前家庭、当前餐次（Pinia）
  composables/      usePageData：页面 onShow 时登录 → 检查家庭 → 加载
  components/       DishThumb、StateView、NoFamily
  styles/base.scss  设计 tokens（CSS 变量）
uniCloud-alipay/
  database/         fm-user / fm-family / fm-dish / fm-menu 的 schema 与索引（客户端无直接权限）
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

> 连接服务空间有两种方式，任选其一：
>
> 1. **HBuilderX 注入**：关联服务空间后，通过 HBuilderX「运行 → 运行到小程序模拟器」启动。CLI 项目不保证会被注入，没生效就用方式 2。
> 2. **环境变量（推荐，命令行也能用）**：复制 `.env.example` 为 `.env.local`，填写服务商（支付宝云填 `alipay`）、uniCloud 控制台里的服务空间 ID 和 ClientSecret（服务空间 → 设置），然后 `pnpm dev`，用微信开发者工具导入 `dist/dev/mp-weixin`。`.env.local` 已被 gitignore。

### 首次接入 uniCloud（需要你的 DCloud 账号）

1. 在 [uniCloud 控制台](https://unicloud.dcloud.net.cn) 创建**支付宝云**服务空间（HBuilderX 会把本地目录命名为 `uniCloud-alipay`，所以仓库目录也叫这个名字）。
2. 用 HBuilderX 打开本项目根目录，右键 `uniCloud-alipay` → 关联云服务空间。
3. 复制 `uniCloud-alipay/cloudfunctions/common/fm-common/config.example.json` 为同目录 `config.json`，填写：
   - `weixin.appid` / `weixin.appsecret`：微信公众平台 → 开发管理 → 开发设置
   - `tokenSecret`：一串随机字符串（≥16 位）
     `config.json` 已被 gitignore，不要提交。
4. 右键 `common/fm-common` → 上传公共模块；右键 `menu-co` → 管理公共模块依赖确认包含 fm-common → 上传部署。
5. 右键 `database` → 初始化云数据库（创建 4 张表及索引）。
6. 在 `src/manifest.json` 的 `mp-weixin.appid` 填入小程序 AppID。
7. 微信公众平台 → 开发设置 → 服务器域名：按 uniCloud 文档添加服务空间的 request / uploadFile 域名。

### 上线前

- 个人主体小程序也需要先完成**小程序备案**再提审。
- 免费服务空间的额度和续期规则以 uniCloud 控制台为准，到期未续可能被释放。
- 想改用阿里云：把 `uniCloud-alipay` 目录改名为 `uniCloud-aliyun`，并把 `.env.local` 的服务商改成 `aliyun`，其余代码不用动。

## 后续

- 「今天吃什么」推荐排除最近 N 天吃过的
- 忌口与口味偏好
- 历史菜单、常吃排行
- 订阅消息提醒
