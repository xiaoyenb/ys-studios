export const MNEMONICS = [
  {
    id: 'chem-valency',
    subjectId: 'chemistry',
    title: '化合价口诀',
    category: '化学 · 化合价与化学式',
    lines: [
      '一价氢氯钾钠银，二价氧钙钡镁锌。',
      '三价铝，四价硅，五价磷；二三铁，二四碳。',
      '二四六硫都齐全，铜汞二价最常见。',
      '单质为零永不变，化合物里代数和为零。',
    ],
    tip: '口诀里的“一价、二价”指化合价的数值，写化学式时还要分清正负：氢、钾、钠、银通常为 +1，氯通常为 −1，氧通常为 −2。',
    keywords: ['化合价', '化学式', '元素', '离子', '物质构成'],
  },
  {
    id: 'chem-radicals',
    subjectId: 'chemistry',
    title: '常见原子团口诀',
    category: '化学 · 原子团与离子',
    lines: [
      '负一硝酸氢氧根：NO₃⁻、OH⁻。',
      '负二硫酸碳酸根：SO₄²⁻、CO₃²⁻。',
      '负三记住磷酸根：PO₄³⁻；正一价的是铵根：NH₄⁺。',
    ],
    tip: '原子团在反应中常作为一个整体参加，读作“根”；写化学式时先确定原子团的个数，再加括号。',
    keywords: ['原子团', '离子', '化学式', '酸碱盐'],
  },
  {
    id: 'chem-metal-activity',
    subjectId: 'chemistry',
    title: '金属活动性顺序',
    category: '化学 · 金属与置换反应',
    lines: [
      '钾 钙 钠 镁 铝，',
      '锌 铁 锡 铅（氢），',
      '铜 汞 银 铂 金。',
    ],
    tip: '排在氢前的金属能与稀盐酸、稀硫酸反应放出氢气；排在前面的金属能把后面的金属从它的盐溶液中置换出来。',
    keywords: ['金属', '置换', '盐溶液', '活动性'],
  },
  {
    id: 'chem-solubility',
    subjectId: 'chemistry',
    title: '酸碱盐溶解性口诀',
    category: '化学 · 酸碱盐',
    lines: [
      '钾钠铵盐硝酸盐，完全溶解不困难。',
      '盐酸盐中银不溶，硫酸盐中钡不溶。',
      '碳酸盐只溶钾钠铵；碱中溶钾钠钡钙（微溶）氨。',
    ],
    tip: 'AgCl 和 BaSO₄ 既不溶于水，也不溶于稀硝酸，常用于检验 Cl⁻ 和 SO₄²⁻。',
    keywords: ['酸碱盐', '溶解', '复分解', '沉淀'],
  },
  {
    id: 'chem-equation',
    subjectId: 'chemistry',
    title: '化学方程式配平口诀',
    category: '化学 · 方程式',
    lines: [
      '先配复杂化学式，再配单质和原子团。',
      '左右原子个数要相等，配平系数化最简。',
      '条件、气体、沉淀别漏写，写完再查一遍。',
    ],
    tip: '配平只能改化学式前面的系数，不能改化学式右下角的数字；气体“↑”和沉淀“↓”只在溶液中反应时标注。',
    keywords: ['化学方程式', '配平', '反应', '质量守恒'],
  },
  {
    id: 'chem-safety',
    subjectId: 'chemistry',
    title: '实验安全操作口诀',
    category: '化学 · 实验安全',
    lines: [
      '浓酸浓碱，不溅不尝；闻气味用手轻轻扇。',
      '稀释浓硫酸：酸入水中，边加边搅，切不可水入酸。',
      '加热试管先预热，管口不对人；实验结束先撤导管再熄灯。',
    ],
    tip: '浓硫酸溶于水放出大量热，必须把浓硫酸沿器壁缓缓倒入水中并不断搅拌。',
    keywords: ['实验', '安全', '浓硫酸', '加热', '制取'],
  },
  {
    id: 'math-multiplication',
    subjectId: 'math',
    title: '九九乘法口诀',
    category: '数学 · 表内乘法',
    lines: [
      '一一得一',
      '一二得二，二二得四',
      '一三得三，二三得六，三三得九',
      '一四得四，二四得八，三四十二，四四十六',
      '一五得五，二五一十，三五十五，四五二十，五五二十五',
      '一六得六，二六十二，三六十八，四六二十四，五六三十，六六三十六',
      '一七得七，二七十四，三七二十一，四七二十八，五七三十五，六七四十二，七七四十九',
      '一八得八，二八十六，三八二十四，四八三十二，五八四十，六八四十八，七八五十六，八八六十四',
      '一九得九，二九十八，三九二十七，四九三十六，五九四十五，六九五十四，七九六十三，八九七十二，九九八十一',
    ],
    tip: '先背 1–5，再背 6–9；每天横着背一遍、竖着背一遍，比一次背完更牢。',
    keywords: ['乘法', '表内乘', '口诀', '二年级'],
  },
  {
    id: 'math-quadratic',
    subjectId: 'math',
    title: '一元二次方程求根口诀',
    category: '数学 · 一元二次方程',
    lines: [
      '负 b 加减根号下，b 方减四 a c；',
      '整体再除以二 a，判别式先看正负。',
      'Δ 大于零两实根，等于零两相等，小于零无实根。',
    ],
    tip: '求根公式：x = [−b ± √(b² − 4ac)] / (2a)，使用前先把方程化成 ax² + bx + c = 0 的一般形式。',
    keywords: ['一元二次', '二次函数', '方程', '判别式'],
  },
  {
    id: 'math-factor',
    subjectId: 'math',
    title: '因式分解口诀',
    category: '数学 · 整式与因式分解',
    lines: [
      '一提二套三分组，十字相乘细查找。',
      '首平方，尾平方，首尾二倍放中央。',
      '两数和乘两数差，等于两数平方差。',
    ],
    tip: '“一提”先提公因式；“二套”套平方差、完全平方公式；“三分组”分组后继续提公因式或套公式。分解到不能再分为止。',
    keywords: ['因式分解', '乘法公式', '整式', '完全平方', '平方差'],
  },
  {
    id: 'math-special-angles',
    subjectId: 'math',
    title: '特殊角三角函数值',
    category: '数学 · 锐角三角函数',
    lines: [
      'sin 30° = 1/2，sin 45° = √2/2，sin 60° = √3/2。',
      'cos 30° = √3/2，cos 45° = √2/2，cos 60° = 1/2。',
      'tan 30° = √3/3，tan 45° = 1，tan 60° = √3。',
    ],
    tip: '正弦值随角度增大而增大，余弦值随角度增大而减小；记不住时画 30°–60°–90° 和 45°–45°–90° 两个特殊三角形。',
    keywords: ['三角函数', '直角三角形', '锐角', '特殊角'],
  },
  {
    id: 'physics-lens',
    subjectId: 'physics',
    title: '凸透镜成像口诀',
    category: '物理 · 透镜及其应用',
    lines: [
      '一倍焦距分虚实，二倍焦距分大小。',
      '物近像远像变大，物远像近像变小。',
      '实像倒立异侧，虚像正立同侧。',
    ],
    tip: 'u > 2f：倒立、缩小、实像；f < u < 2f：倒立、放大、实像；u < f：正立、放大、虚像。',
    keywords: ['透镜', '眼睛', '成像', '照相机', '投影'],
  },
  {
    id: 'physics-light',
    subjectId: 'physics',
    title: '光的反射与折射口诀',
    category: '物理 · 光现象',
    lines: [
      '三线共面，法线居中，两角相等，光路可逆。',
      '空气入水，折射角小；水入空气，折射角大。',
      '岸上看水变浅，水中看岸变高。',
    ],
    tip: '入射角、反射角、折射角都是光线与法线的夹角，不是与水面或镜面的夹角。',
    keywords: ['光', '反射', '折射', '平面镜', '光现象'],
  },
  {
    id: 'physics-series-parallel',
    subjectId: 'physics',
    title: '串联并联电路口诀',
    category: '物理 · 电流与电路',
    lines: [
      '串联电流处处相等，电压相加；',
      '并联电压处处相等，电流相加。',
      '串联电阻相加，并联电阻倒数相加。',
    ],
    tip: 'R串 = R₁ + R₂；1/R并 = 1/R₁ + 1/R₂。判断电路先看电流路径是否只有一条。',
    keywords: ['欧姆', '电流', '电压', '电阻', '串并联', '电路'],
  },
  {
    id: 'physics-power',
    subjectId: 'physics',
    title: '电功率与电热口诀',
    category: '物理 · 电功率',
    lines: [
      'P 等于 U 乘 I，W 等于 P 乘 t。',
      '纯电阻电路：P = I²R = U²/R。',
      '额定功率看铭牌，实际功率看实际电压。',
    ],
    tip: '灯泡亮度由实际功率决定，不由额定功率直接决定；实际电压变化时，电阻通常按不变处理（温度影响较大时除外）。',
    keywords: ['电功率', '电热', '焦耳', '灯泡', '额定'],
  },
  {
    id: 'physics-magnetism',
    subjectId: 'physics',
    title: '安培定则与左手定则',
    category: '物理 · 电与磁',
    lines: [
      '安培定则：右手握螺线管，四指顺着电流绕，拇指所指是 N 极。',
      '左手定则：磁感线穿手心，四指指电流，拇指指受力。',
      '电流方向改变，磁场方向改变；电流越大、匝数越多，磁性越强。',
    ],
    tip: '安培定则判断“电流产生磁场”；左手定则判断“通电导体在磁场中受力”。两个定则不要混用。',
    keywords: ['磁', '电生磁', '电磁', '螺线管', '电动机'],
  },
  {
    id: 'physics-buoyancy',
    subjectId: 'physics',
    title: '浮力与浮沉口诀',
    category: '物理 · 浮力',
    lines: [
      '浮力等于排开液体的重力：F浮 = ρ液 g V排。',
      '漂浮、悬浮时浮力等于重力；沉底时浮力加支持力等于重力。',
      '密度比较判浮沉：ρ物小于 ρ液 漂浮，等于悬浮，大于下沉。',
    ],
    tip: 'V排是物体浸入液体中的体积，不是物体的总体积；漂浮时 V排 < V物。',
    keywords: ['浮力', '压强', '密度', '浮沉', '阿基米德'],
  },
  {
    id: 'english-be',
    subjectId: 'english',
    title: 'be 动词用法口诀',
    category: '英语 · be 动词',
    lines: [
      '我用 am，你用 are，is 连着他她它。',
      '单数名词用 is，复数名词全用 are。',
      '变疑问，往前提，句末问号莫丢弃；变否定，更容易，be 后 not 莫忘记。',
    ],
    tip: 'I am / you are / he is / she is / it is / we are / they are；缩写：I’m, you’re, he’s, she’s, it’s, we’re, they’re。',
    keywords: ['be动词', 'am', 'is', 'are', '语法', 'Unit 1'],
  },
  {
    id: 'english-third-person',
    subjectId: 'english',
    title: '第三人称单数动词变化',
    category: '英语 · 一般现在时',
    lines: [
      '第三人称单数，动词一般加 s。',
      'ch、sh、o、s、x 结尾加 es。',
      '辅音字母加 y，变 y 为 i 再加 es。',
    ],
    tip: 'play → plays（元音字母 + y 直接加 s）；study → studies（辅音字母 + y，变 y 为 i 加 es）；go → goes；watch → watches。',
    keywords: ['第三人称', '一般现在', '动词', '语法', 'Unit'],
  },
  {
    id: 'english-ordinal',
    subjectId: 'english',
    title: '序数词变化口诀',
    category: '英语 · 序数词与日期',
    lines: [
      '基变序，有规律，词尾加上 th。',
      '一二三特殊记；八减 t，九去 e，f 来把 ve 替。',
      'ty 变 tie，th 前加 e。',
    ],
    tip: 'first, second, third；fifth, eighth, ninth, twelfth；twentieth；twenty-first。日期中“几月几日”用序数词。',
    keywords: ['序数词', '日期', '月份', 'Unit'],
  },
  {
    id: 'english-month-days',
    subjectId: 'english',
    title: '月份天数口诀',
    category: '英语 · 月份与日期',
    lines: [
      '一三五七八十腊，三十一天永不差。',
      '四六九冬三十天，平年二月二十八，闰年再把一天加。',
    ],
    tip: '腊月指 12 月（December），冬月指 11 月（November）；闰年二月 29 天，全年 366 天。',
    keywords: ['月份', '日期', '闰年', 'Unit'],
  },
  {
    id: 'chinese-pinyin',
    subjectId: 'chinese',
    title: '拼音标调口诀',
    category: '语文 · 汉语拼音',
    lines: [
      '有 a 不放过，没 a 找 o e。',
      'i u 并列标在后，单个韵母不必说。',
      '小 ü 见了 j q x，去掉两点还念 ü。',
    ],
    tip: '声调标在韵母的主要元音上；iu、ui 并列时标在后面字母上，如 liú、guī。',
    keywords: ['拼音', '识字', '汉语拼音', '标调'],
  },
  {
    id: 'chinese-strokes',
    subjectId: 'chinese',
    title: '汉字笔顺口诀',
    category: '语文 · 识字与写字',
    lines: [
      '先横后竖，先撇后捺。',
      '从上到下，从左到右。',
      '先外后内，先中间后两边；先里头后封口。',
    ],
    tip: '笔顺规则有例外，遇到“竖弯钩”“走之底”等结构要结合具体字记忆；写字前先观察范字。',
    keywords: ['识字', '写字', '汉字', '笔顺'],
  },
  {
    id: 'geo-continents',
    subjectId: 'geography',
    title: '七大洲四大洋口诀',
    category: '地理 · 世界海陆分布',
    lines: [
      '亚非北南美，南极欧大洋。',
      '太大印北，四洋贯通。',
    ],
    tip: '七大洲按面积从大到小：亚洲、非洲、北美洲、南美洲、南极洲、欧洲、大洋洲；四大洋按面积：太平洋、大西洋、印度洋、北冰洋。',
    keywords: ['大洲', '大洋', '世界', '海陆', '地理'],
  },
  {
    id: 'geo-coords',
    subjectId: 'geography',
    title: '经纬度判断口诀',
    category: '地理 · 经纬网',
    lines: [
      '北纬 N，南纬 S；东经 E，西经 W。',
      '向北增大是北纬，向南增大是南纬。',
      '向东增大是东经，向西增大是西经。',
    ],
    tip: '赤道是南北纬的分界线，本初子午线是东西经的分界线；先看数值变化方向，再判断经纬度。',
    keywords: ['经纬', '地图', '地球', '坐标'],
  },
  {
    id: 'history-dynasty',
    subjectId: 'history',
    title: '中国朝代歌',
    category: '历史 · 中国古代史',
    lines: [
      '夏商与西周，东周分两段；',
      '春秋和战国，一统秦两汉；',
      '三分魏蜀吴，二晋前后沿；',
      '南北朝并立，隋唐五代传；',
      '宋元明清后，皇朝至此完。',
    ],
    tip: '先按时间顺序背朝代，再为每个朝代补充建立时间、都城、重要事件和代表人物。',
    keywords: ['古代', '朝代', '夏商', '秦汉', '隋唐', '宋元明清'],
  },
  {
    id: 'history-modern',
    subjectId: 'history',
    title: '中国近代史时间轴口诀',
    category: '历史 · 中国近代史',
    lines: [
      '1840 鸦片战争，1856 第二次鸦片战争。',
      '1894 甲午中日战争，1900 八国联军侵华。',
      '1911 辛亥革命，1919 五四运动，1921 中国共产党成立。',
      '1937 全面抗战，1945 抗战胜利，1949 新中国成立。',
    ],
    tip: '时间轴要配合“原因—经过—结果—影响”一起记；注意区分 1931 九一八事变与 1937 七七事变。',
    keywords: ['近代', '鸦片', '辛亥', '五四', '抗战', '新中国'],
  },
  {
    id: 'bio-photosynthesis',
    subjectId: 'biology',
    title: '光合作用与呼吸作用口诀',
    category: '生物 · 绿色植物',
    lines: [
      '光合作用：二氧化碳加水，光照叶绿体，制造有机物，放出氧气。',
      '呼吸作用：有机物加氧气，线粒体里分解，放出二氧化碳、水和能量。',
      '光合作用储存能量，呼吸作用释放能量。',
    ],
    tip: '光合作用只在有叶绿体的细胞中进行；呼吸作用在所有活细胞中都能进行，白天和夜晚都进行。',
    keywords: ['光合', '呼吸', '植物', '叶绿体', '线粒体'],
  },
  {
    id: 'bio-cell',
    subjectId: 'biology',
    title: '动植物细胞结构口诀',
    category: '生物 · 细胞',
    lines: [
      '植物细胞有壁、液、绿；',
      '动物细胞无壁、无液、无绿。',
      '细胞膜控进出，细胞核管遗传，细胞质能流动。',
    ],
    tip: '细胞壁、液泡、叶绿体是植物细胞常见的三个结构，但并非所有植物细胞都有叶绿体（如根细胞）。',
    keywords: ['细胞', '生物体', '细胞壁', '叶绿体'],
  },
  {
    id: 'politics-values',
    subjectId: 'politics',
    title: '社会主义核心价值观',
    category: '道德与法治 · 价值观',
    lines: [
      '富强、民主、文明、和谐（国家层面）。',
      '自由、平等、公正、法治（社会层面）。',
      '爱国、敬业、诚信、友善（个人层面）。',
    ],
    tip: '三个层面各四个词，共 24 字；答题时要结合具体情境说明做法，不要只堆词。',
    keywords: ['价值', '道德', '法治', '社会'],
  },
  {
    id: 'it-binary',
    subjectId: 'it',
    title: '进制转换口诀',
    category: '信息科技 · 数据与编码',
    lines: [
      '逢 N 进一，借一当 N。',
      '二进制只有 0 和 1；十六进制 A–F 代表 10–15。',
      '二进制转十进制按位权展开，十进制转二进制除二取余倒着读。',
    ],
    tip: '位权从右往左依次是 2⁰、2¹、2²……；转换完成后可以用反向运算检验。',
    keywords: ['二进制', '进制', '数据', '编码'],
  },
]

export const MNEMONIC_SUBJECTS = [
  { id: 'chemistry', name: '化学' },
  { id: 'math', name: '数学' },
  { id: 'physics', name: '物理' },
  { id: 'english', name: '英语' },
  { id: 'chinese', name: '语文' },
  { id: 'geography', name: '地理' },
  { id: 'history', name: '历史' },
  { id: 'biology', name: '生物' },
  { id: 'politics', name: '道德与法治' },
  { id: 'it', name: '信息科技' },
]

const CHAPTER_RULES = {
  chemistry: [
    ['chem-valency', /化合价|化学式|元素|离子|物质构成/],
    ['chem-radicals', /原子团|离子|化学式/],
    ['chem-metal-activity', /金属|置换/],
    ['chem-solubility', /酸碱盐|溶解|溶解度|溶液|复分解|沉淀/],
    ['chem-equation', /化学方程式|配平|质量守恒|反应/],
    ['chem-safety', /实验|制取|操作|安全/],
  ],
  math: [
    ['math-multiplication', /表内乘法|乘法口诀|九九乘法/],
    ['math-quadratic', /一元二次|二次函数/],
    ['math-factor', /因式分解|乘法公式/],
    ['math-special-angles', /三角函数|锐角|直角三角形/],
  ],
  physics: [
    ['physics-lens', /透镜|眼睛|成像|照相机/],
    ['physics-light', /光现象|光的反射|光的折射|平面镜/],
    ['physics-series-parallel', /欧姆|电流|电压|电阻|串并联|电路/],
    ['physics-power', /电功率|电热|焦耳|额定/],
    ['physics-magnetism', /电与磁|磁场|电流的磁效应|电磁铁|螺线管|电动机/],
    ['physics-buoyancy', /浮力|浮沉|阿基米德/],
  ],
  english: [
    ['english-be', /be ?动词|be动词|系动词|语法|人称代词/],
    ['english-third-person', /第三人称|一般现在|动词变化/],
    ['english-ordinal', /序数词|日期表达/],
    ['english-month-days', /月份|闰年/],
  ],
  chinese: [
    ['chinese-pinyin', /拼音|标调|汉语拼音/],
    ['chinese-strokes', /识字|写字|汉字|笔顺/],
  ],
  geography: [
    ['geo-continents', /大洲|大洋|世界|海陆/],
    ['geo-coords', /经纬|地图|地球/],
  ],
  history: [
    ['history-dynasty', /夏商|西周|秦汉|三国|隋唐|宋元明清|朝代歌/],
    ['history-modern', /鸦片|辛亥|五四|抗战|新中国成立|中国近代/],
  ],
  biology: [
    ['bio-photosynthesis', /光合作用|呼吸作用|绿色植物/],
    ['bio-cell', /细胞|生物体/],
  ],
  politics: [['politics-values', /核心价值|价值观|爱国|诚信|社会责任/]],
  it: [['it-binary', /二进制|进制|数据|编码/]],
}

export function getMnemonicsForSubject(subjectId, source = MNEMONICS) {
  return source.filter((item) => (item.subjectId || item.subject_id) === subjectId && item.enabled !== false)
}

export function findMnemonicsForChapter(book, chapter, source = MNEMONICS) {
  if (!book || !chapter) return []
  const rules = CHAPTER_RULES[book.subjectId] || []
  const title = chapter.title || ''
  const matchedIds = new Set()
  rules.forEach(([id, pattern]) => {
    if (pattern.test(title)) matchedIds.add(id)
  })
  const dynamicMatches = source.filter((item) => {
    if (item.enabled === false) return false
    if ((item.subjectId || item.subject_id) !== book.subjectId) return false
    return (item.keywords || []).some((keyword) => keyword && title.includes(keyword))
  })
  const dynamicIds = new Set(dynamicMatches.map((item) => String(item.id)))
  return source
    .filter((item) => item.enabled !== false)
    .filter((item) => {
      const key = item.seed_key || item.seedKey || item.id
      return matchedIds.has(String(key)) || dynamicIds.has(String(key))
    })
    .slice(0, 2)
}

export function getMnemonicCounts(source = MNEMONICS) {
  return source.reduce((counts, item) => {
    const subjectId = item.subjectId || item.subject_id
    if (!subjectId || item.enabled === false) return counts
    counts[subjectId] = (counts[subjectId] || 0) + 1
    return counts
  }, {})
}
