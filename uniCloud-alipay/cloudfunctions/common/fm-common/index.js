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

const AI_DEFAULT_URL = 'https://open.bigmodel.cn/api/paas/v4/chat/completions'
const AI_DEFAULT_MODEL = 'glm-4-flash'

/**
 * 调用 OpenAI 兼容的对话接口（默认智谱 glm-4-flash，免费），返回解析后的 JSON 对象。
 * 配置见 config.json 的 ai.apiKey / ai.model / ai.baseUrl。
 */
async function askJson(config, system, user) {
  const ai = config.ai || {}
  if (!ai.apiKey) throw new Error('未配置 AI：请在 config.json 填写 ai.apiKey')
  const res = await uniCloud.httpclient.request(ai.baseUrl || AI_DEFAULT_URL, {
    method: 'POST',
    contentType: 'json',
    dataType: 'json',
    timeout: 15000,
    headers: { Authorization: `Bearer ${ai.apiKey}` },
    data: {
      model: ai.model || AI_DEFAULT_MODEL,
      temperature: 0.2,
      max_tokens: 1200,
      response_format: { type: 'json_object' },
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

module.exports = { loadConfig, createToken, verifyToken, code2Session, askJson }
