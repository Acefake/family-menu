/** 内置头像目录；ID 与云对象白名单一致。 */
export const AVATARS = [
  ['toddler-boy', '小小男孩'],
  ['girl-clip', '发夹女孩'],
  ['boy-cap', '棒球帽男孩'],
  ['girl-braid', '辫子女孩'],
  ['young-man-glasses', '卷发青年'],
  ['young-man-stripes', '条纹青年'],
  ['young-woman-pixie', '短发女生'],
  ['young-woman-glasses', '眼镜女生'],
  ['dad-stubble', '胡茬爸爸'],
  ['mom-straight', '直发妈妈'],
  ['grandpa-bald', '慈祥爷爷'],
  ['grandma-bun', '盘发奶奶'],

  ['boy', '活力男孩'],
  ['girl', '双辫女孩'],
  ['boy-glasses', '眼镜男孩'],
  ['girl-bob', '短发女孩'],
  ['young-man', '清爽青年'],
  ['young-woman', '长发女生'],
  ['middle-man', '温和叔叔'],
  ['middle-woman', '卷发阿姨'],
  ['man-glasses', '眼镜叔叔'],
  ['woman-bun', '盘发阿姨'],
  ['senior-man', '银发爷爷'],
  ['senior-woman', '卷发奶奶'],
  ['baby', '宝宝'],
  ['dad', '爸爸'],
  ['mom', '妈妈'],
  ['grandpa', '爷爷'],
  ['grandma', '奶奶'],
].map(([id, label]) => ({ id, label, src: `/static/avatars/${id}.png` }))

const babyName = '小莲花'
const babyAvatar = '/static/avatars/baby.png'
const portraits = [
  { suffix: /(?:姥姥|外婆|奶奶|祖母|阿嬷)$/, src: '/static/avatars/grandma.png' },
  { suffix: /(?:姥爷|外公|爷爷|祖父|阿公)$/, src: '/static/avatars/grandpa.png' },
  { suffix: /(?:妈妈|妈咪|母亲|宝妈)$/, src: '/static/avatars/mom.png' },
  { suffix: /(?:爸爸|爹爹|爹地|父亲|宝爸)$/, src: '/static/avatars/dad.png' },
  { suffix: /(?:宝宝|宝贝|婴儿|女宝)$/, src: babyAvatar },
]

/** 按称呼结尾匹配亲属关系，例如「小满妈妈」和「奶奶（杭州）」。 */
export function avatarFor(name: string, avatarId?: string): string {
  const chosen = AVATARS.find((item) => item.id === avatarId)
  if (chosen) return chosen.src
  const title = name.trim().replace(/\s*[(（][^()（）]*[)）]$/, '')
  if (title === babyName) return babyAvatar
  const portrait = portraits.find(({ suffix }) => suffix.test(title))
  return portrait?.src ?? ''
}
