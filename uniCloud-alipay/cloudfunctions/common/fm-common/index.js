'use strict'

const nodeCrypto = require('crypto')

/** 读取同目录 config.json（已 gitignore，复制 config.example.json 后填写） */
function loadConfig() {
  let config
  try {
    config = require('./config.json')
  } catch {
    throw new Error('缺少 fm-common/config.json，请复制 config.example.json 并填写')
  }
  if (!config.tokenSecret || config.tokenSecret.length < 16) {
    throw new Error('config.json 的 tokenSecret 至少 16 位')
  }
  return config
}

function sign(payload, secret) {
  return nodeCrypto.createHmac('sha256', secret).update(payload).digest('base64url')
}

/** 令牌格式：base64url(JSON{uid,exp}).签名 */
function createToken(uid, config) {
  const exp = Date.now() + (config.tokenExpiresIn || 2592000) * 1000
  const payload = Buffer.from(JSON.stringify({ uid, exp })).toString('base64url')
  return { token: `${payload}.${sign(payload, config.tokenSecret)}`, tokenExpired: exp }
}

/** 校验通过返回 uid，否则返回空字符串 */
function verifyToken(token, config) {
  if (typeof token !== 'string') return ''
  const [payload, signature] = token.split('.')
  if (!payload || !signature) return ''
  const expected = sign(payload, config.tokenSecret)
  const a = Buffer.from(signature)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !nodeCrypto.timingSafeEqual(a, b)) return ''
  try {
    const { uid, exp } = JSON.parse(Buffer.from(payload, 'base64url').toString())
    return typeof uid === 'string' && exp > Date.now() ? uid : ''
  } catch {
    return ''
  }
}

/** 微信 code 换 openid */
async function code2Session(code, config) {
  const { appid, appsecret } = config.weixin || {}
  const url =
    'https://api.weixin.qq.com/sns/jscode2session' +
    `?appid=${encodeURIComponent(appid)}&secret=${encodeURIComponent(appsecret)}` +
    `&js_code=${encodeURIComponent(code)}&grant_type=authorization_code`
  // uniCloud 运行环境提供的 HTTP 客户端
  const res = await uniCloud.httpclient.request(url, { dataType: 'json' })
  if (!res.data || !res.data.openid) {
    throw new Error(`微信登录失败：${(res.data && res.data.errmsg) || res.status}`)
  }
  return res.data.openid
}

/**
 * 对话接口是非流式的：模型要把整道菜谱写完才会一次性返回，免费的小模型加排队，十几二十秒是常事。
 * 单次给 30 秒；几家加起来不超过 50 秒，给云函数 60 秒的时限留出余量。
 */
const TEXT_TIMEOUT_MS = 30000
const TEXT_BUDGET_MS = 50000
/** 剩下的预算不到这个数，就不再换下一家（来不及等它回） */
const TEXT_MIN_ATTEMPT_MS = 8000

const IMAGE_SIZE = '1024x1024'
/** 排除文字、水印和人手，菜图里最常见的几种跑偏 */
const IMAGE_AVOID = '文字, 水印, 人物, 手, 模糊, 变形'
const NO_AI = '未配置 AI：请在 config.json 的 ai.providers 里至少填一家的 apiKey'

/**
 * 各服务商的差异：显示名、对话接口、生图接口。
 * 对话不支持 response_format（JSON 模式）的靠提示词要求只输出 JSON，解析时再从文本里抠出来。
 */
const PROVIDERS = {
  zhipu: {
    label: '智谱',
    text: {
      url: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
      model: 'glm-4-flash',
      jsonMode: true,
    },
    image: {
      url: 'https://open.bigmodel.cn/api/paas/v4/images/generations',
      model: 'cogview-3-flash',
      body: (model, prompt) => ({ model, prompt, size: IMAGE_SIZE }),
      pick: (data) => data.data && data.data[0] && data.data[0].url,
    },
  },
  siliconflow: {
    label: '硅基流动',
    text: {
      url: 'https://api.siliconflow.cn/v1/chat/completions',
      model: 'Qwen/Qwen2.5-7B-Instruct',
      jsonMode: false,
    },
    image: {
      url: 'https://api.siliconflow.cn/v1/images/generations',
      model: 'Kwai-Kolors/Kolors',
      // 反向提示词不是所有模型都支持（如 Z-Image-Turbo），只给 Kolors 加
      body: (model, prompt) => ({
        model,
        prompt,
        image_size: IMAGE_SIZE,
        ...(model.startsWith('Kwai-Kolors/') && { negative_prompt: IMAGE_AVOID }),
      }),
      pick: (data) => data.images && data.images[0] && data.images[0].url,
    },
  },
}

/** config.json 里某家的配置：{ apiKey, model, imageModel, baseUrl, imageUrl }，只有 apiKey 必填 */
function providerConfig(config, id) {
  const providers = (config.ai && config.ai.providers) || {}
  return providers[id] || {}
}

/** 所有支持的服务商及是否填了 Key，给设置页展示；Key 本身不外传 */
function aiOptions(config) {
  return Object.entries(PROVIDERS).map(([id, spec]) => {
    const own = providerConfig(config, id)
    return {
      id,
      label: spec.label,
      ready: Boolean(own.apiKey),
      textModel: own.model || spec.text.model,
      imageModel: own.imageModel || spec.image.model,
    }
  })
}

/**
 * 决定这次用哪家：先看指定的（家庭在设置里选的），没配好就用 config 里的 ai.default，
 * 再不行用第一家配好 Key 的；一家都没配好返回空串。kind 为 text 或 image。
 */
function chooseProvider(config, kind, wanted) {
  const ready = aiOptions(config)
    .filter((o) => o.ready)
    .map((o) => o.id)
  const fallback = config.ai && config.ai.default && config.ai.default[kind]
  return [wanted, fallback].find((id) => ready.includes(id)) || ready[0] || ''
}

/** 这次的尝试顺序：先用选中的那家，再依次是其他配好 Key 的，一家出问题可以换下一家 */
function providerOrder(config, kind, wanted) {
  const first = chooseProvider(config, kind, wanted)
  if (!first) return []
  const others = aiOptions(config)
    .filter((o) => o.ready && o.id !== first)
    .map((o) => o.id)
  return [first, ...others]
}

/**
 * 把调用 AI 时抛出的底层异常换成人能看懂的话：超时、连不上。
 * 我们自己抛的错（以「AI 」「未配置」开头）本来就是写给人看的，原样保留。
 */
function friendlyError(err, what) {
  const message = String((err && err.message) || err)
  if (/^(AI |未配置)/.test(message)) return err
  if ((err && /Timeout/i.test(err.name || '')) || /timeout/i.test(message)) {
    return new Error(`AI ${what}响应超时了，稍后再试一次`)
  }
  return new Error(`AI ${what}暂时连不上，稍后再试一次`)
}

/**
 * 调用 OpenAI 兼容的对话接口，返回解析后的 JSON 对象。wanted 是想用的服务商 ID，可省略。
 * 选中的那家超时或出错时，自动换另一家配好 Key 的再试一次，每家的错误都记到云端日志。
 */
async function askJson(config, system, user, wanted) {
  const order = providerOrder(config, 'text', wanted)
  if (!order.length) throw new Error(NO_AI)
  let lastError
  const attempted = []
  const started = Date.now()
  for (const id of order) {
    const remaining = TEXT_BUDGET_MS - (Date.now() - started)
    if (lastError && remaining < TEXT_MIN_ATTEMPT_MS) break
    attempted.push(id)
    try {
      return await askVia(config, id, system, user, Math.min(TEXT_TIMEOUT_MS, remaining))
    } catch (err) {
      lastError = err
      console.error(`[AI 文字] ${PROVIDERS[id].label} 失败：${(err && err.message) || err}`)
    }
  }
  const tried =
    attempted.length > 1 ? `（已试过${attempted.map((id) => PROVIDERS[id].label).join('、')}）` : ''
  const failure = friendlyError(lastError, '')
  failure.message += tried
  throw failure
}

/** 用指定的一家服务商调一次对话接口，timeout 是这一次最多等多久（毫秒） */
async function askVia(config, id, system, user, timeout) {
  const spec = PROVIDERS[id].text
  const own = providerConfig(config, id)
  const res = await uniCloud.httpclient.request(own.baseUrl || spec.url, {
    method: 'POST',
    contentType: 'json',
    dataType: 'json',
    timeout,
    headers: { Authorization: `Bearer ${own.apiKey}` },
    data: {
      model: own.model || spec.model,
      temperature: 0.2,
      max_tokens: 1200,
      ...(spec.jsonMode && { response_format: { type: 'json_object' } }),
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    },
  })
  const content = res.data && res.data.choices && res.data.choices[0] && res.data.choices[0].message.content
  if (!content) {
    throw new Error(`AI 调用失败：${(res.data && res.data.error && res.data.error.message) || res.status}`)
  }
  // 模型偶尔会包一层 ```json 代码块
  const match = String(content).match(/\{[\s\S]*\}/)
  if (!match) throw new Error('AI 返回的内容无法解析')
  return JSON.parse(match[0])
}

/**
 * 按提示词生成一张方图，下载后存进云存储，返回 fileID。wanted 是想用的服务商 ID，可省略。
 * 接口给的是会过期的临时链接，所以必须转存。
 */
async function generateImage(config, prompt, cloudDir, wanted) {
  try {
    return await generateVia(config, prompt, cloudDir, wanted)
  } catch (err) {
    console.error(`[AI 生图] 失败：${(err && err.message) || err}`)
    throw friendlyError(err, '生图')
  }
}

async function generateVia(config, prompt, cloudDir, wanted) {
  const id = chooseProvider(config, 'image', wanted)
  if (!id) throw new Error(NO_AI)
  const spec = PROVIDERS[id].image
  const own = providerConfig(config, id)
  const res = await uniCloud.httpclient.request(own.imageUrl || spec.url, {
    method: 'POST',
    contentType: 'json',
    dataType: 'json',
    timeout: 30000,
    headers: { Authorization: `Bearer ${own.apiKey}` },
    data: spec.body(own.imageModel || spec.model, prompt),
  })
  const body = res.data || {}
  const url = spec.pick(body)
  if (!url) {
    throw new Error(`AI 生图失败：${(body.error && body.error.message) || body.message || res.status}`)
  }
  // 不设 dataType，返回的 data 是 Buffer
  const file = await uniCloud.httpclient.request(url, { timeout: 10000, followRedirect: true })
  if (file.status !== 200 || !Buffer.isBuffer(file.data) || !file.data.length) {
    throw new Error(`下载生成的图片失败：${file.status}`)
  }
  const type = String((file.headers && file.headers['content-type']) || '')
  const ext = type.includes('jpeg') ? 'jpg' : type.includes('webp') ? 'webp' : 'png'
  const { fileID } = await uniCloud.uploadFile({
    cloudPath: `${cloudDir}/${Date.now()}.${ext}`,
    fileContent: file.data,
  })
  return fileID
}

module.exports = {
  loadConfig,
  createToken,
  verifyToken,
  code2Session,
  aiOptions,
  chooseProvider,
  askJson,
  generateImage,
}
