// 测试：重名合并提醒 + 删除修正
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('C:/Users/Administrator/.workbuddy/binaries/node/workspace/node_modules/jsdom');

const html = fs.readFileSync(path.join(__dirname, '族谱网页.html'), 'utf8');

let confirmQueue = [];
let alertLog = [];
let confirmLog = [];

function makeDOM(confirmReturnList) {
  confirmQueue = confirmReturnList.slice();
  alertLog = [];
  confirmLog = [];
  const dom = new JSDOM(html, {
    url: 'http://localhost/',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
  });
  const w = dom.window;
  w.confirm = (msg) => { confirmLog.push(msg); const v = confirmQueue.shift(); return v; };
  w.alert = (m) => { alertLog.push(m); };
  return new Promise(resolve => {
    if (w.document.readyState === 'complete') return resolve(dom);
    w.addEventListener('load', () => resolve(dom));
  });
}

function getState(w) { return JSON.parse(w.localStorage.getItem('zupu_data_v3')); }
function assert(cond, msg) {
  if (!cond) { console.error('❌ FAIL:', msg); process.exitCode = 1; }
  else console.log('✅', msg);
}

(async () => {
  // ===== 场景0：初始数据 + 网格对齐（对应截图问题）=====
  let dom0 = await makeDOM([]);
  let w0 = dom0.window;
  // 0a. 初始数据应为截图真实世系：6 个节点、无占位、含聚才/得才
  const nodes0 = w0.document.querySelectorAll('#tree .node');
  const ph0 = w0.document.querySelectorAll('#tree .node.ph');
  const names0 = [...nodes0].map(n => n.querySelector('.nm') ? n.querySelector('.nm').textContent : '');
  assert(nodes0.length === 6, '场景0：初始渲染 6 个节点（世昌+玘旺兴+聚才得才），实际 ' + nodes0.length);
  assert(ph0.length === 0, '场景0：无占位节点（旧缓存数据已被 v2 初始数据取代）');
  assert(names0.some(t => t.includes('聚才')) && names0.some(t => t.includes('得才')), '场景0：聚才/得才 均正常显示');
  // 0b. 对齐校验：卡片中心(left) 必须与连线落点(H x) 一致
  const cssText = w0.document.querySelector('style').textContent;
  assert(cssText.includes('translate(-50%, -50%)'), '场景0：节点居中定位 translate(-50%,-50%)（歪线根因已修）');
  const lefts = [...w0.document.querySelectorAll('#tree .node')].map(n => parseFloat(n.style.left));
  const pathCx = [...w0.document.querySelectorAll('#tree svg path')]
    .map(p => { const m = p.getAttribute('d').match(/H(-?[\d.]+)/); return m ? parseFloat(m[1]) : null; })
    .filter(v => v !== null);
  const allAligned = pathCx.every(cx => lefts.some(l => Math.abs(l - cx) < 0.5));
  assert(allAligned && pathCx.length > 0, '场景0：全部连线落点与卡片中心严格对齐（' + pathCx.length + ' 条）');
  // 0c. 卡片为等宽网格：同世代节点 top 相同
  const tops = [...w0.document.querySelectorAll('#tree .node')].map(n => parseFloat(n.style.top));
  const uniqTops = [...new Set(tops.map(t => Math.round(t)))];
  assert(uniqTops.length === 3, '场景0：三个世代各占一行（top 只有 3 种）');

  // ===== 场景1：正常新建（无重名）=====
  let dom = await makeDOM([]);
  let w = dom.window;
  w.document.getElementById('aName').value = '大郎';
  w.document.getElementById('aSpouse').value = '';      // 留空，供合并时补全
  w.document.getElementById('aNote').value = '';
  w.document.querySelector('input[name="asex"][value="m"]').checked = true;
  w.document.getElementById('aGen').value = 'new';
  w.document.getElementById('aFather').value = '0:0';
  w.submitAdd();
  let st = getState(w);
  assert(st.generations.length === 4, '场景1：自动新建了第四世（初始已有三世）');
  assert(st.generations[3].people[0].givenName === '大郎', '场景1：第四世首人为大郎');
  assert(st.generations[0].people[0].sons[3].givenName === '大郎', '场景1：第一世新增四子占位被填上大郎（父系关联）');

  // ===== 场景2：重名 → 确认合并（不新建，复用场景1的 DOM）=====
  confirmQueue = [true]; confirmLog = []; alertLog = [];
  w.document.getElementById('aName').value = '大郎';
  w.document.getElementById('aSpouse').value = '配王氏';
  w.document.getElementById('aNote').value = '次房';
  w.document.getElementById('aGen').value = 'new';
  w.document.getElementById('aFather').value = '0:0';
  w.submitAdd();
  st = getState(w);
  const gen4Count = st.generations.length > 3 ? st.generations[3].people.length : 0;
  assert(gen4Count === 1, '场景2：合并后未新建重复人物（仍只有1个大郎）');
  assert(st.generations[3].people[0].spouse === '配王氏', '场景2：合并后补全了空配偶字段');
  assert(st.generations[3].people[0].note === '次房', '场景2：合并后补全了空备注字段');
  assert(confirmLog.length === 1 && confirmLog[0].includes('已存在'), '场景2：弹出了重名合并提醒');
  assert(alertLog.some(m => m.includes('合并')), '场景2：合并后给出提示');

  // ===== 场景3：重名 → 取消合并（仍添加）=====
  dom = await makeDOM([false]);
  w = dom.window;
  w.document.getElementById('aName').value = '世昌';
  w.document.getElementById('aGen').value = 'new';
  w.document.getElementById('aFather').value = '';
  w.submitAdd();
  st = getState(w);
  const allNames = st.generations.flatMap(g => g.people.map(p => p.givenName));
  const shiChangCount = allNames.filter(n => n === '世昌').length;
  assert(shiChangCount === 2, '场景3：选择不合并 → 仍添加到对应位置（出现2个世昌）');

  // ===== 场景4：删除儿子占位（修正后的 clearSon 按索引）=====
  dom = await makeDOM([true]);
  w = dom.window;
  w.document.getElementById('aName').value = '阿大';
  w.document.getElementById('aGen').value = '1';   // 作为第一世之子，应入第二世
  w.document.getElementById('aFather').value = '0:0';
  w.submitAdd();
  w.openQuery();
  w.doQuery('阿大');
  const hits = w.document.querySelectorAll('#queryResult .hit');
  assert(hits.length === 1, '场景4：查询到阿大（作为第二世正式人物1条）');
  const delBtn = w.document.querySelector('#queryResult .delBtn');
  assert(delBtn !== null, '场景4：儿子记录带删除按钮');
  delBtn.click();
  st = getState(w);
  const firstSons = st.generations[0].people[0].sons;
  assert(firstSons[3].givenName === '', '场景4：clearSon 按索引清空了对应儿子占位（修正生效）');

  // ===== 场景5：删除正式人物（delPerson）=====
  dom = await makeDOM([true]);
  w = dom.window;
  w.document.getElementById('aName').value = '小乙';
  w.document.getElementById('aGen').value = '1';   // 入第二世，与玘/旺/兴同辈
  w.document.getElementById('aFather').value = '0:0';
  w.submitAdd();
  w.openQuery();
  w.doQuery('小乙');
  const pDelBtn = w.document.querySelector('#queryResult .delBtn');
  pDelBtn.click();
  st = getState(w);
  const stillThere = st.generations.flatMap(g => g.people).some(p => p.givenName === '小乙');
  assert(!stillThere, '场景5：delPerson 删除了正式人物');
  assert(st.generations[0].people[0].sons.find(s => s.givenName === '小乙') === undefined, '场景5：父系同名占位已恢复为空');

  // ===== 场景6：编辑人物（openEdit / submitEdit）=====
  dom = await makeDOM([]);
  w = dom.window;
  w.openEdit(1, 0);                 // 编辑第二世 玘
  w.document.getElementById('aSpouse').value = '配张氏';
  w.document.getElementById('aNote').value = '长房';
  w.submitEdit(1, 0);
  st = getState(w);
  assert(st.generations[1].people[0].givenName === '玘', '场景6：编辑后名字仍为玘');
  assert(st.generations[1].people[0].spouse === '配张氏', '场景6：配偶已更新');
  assert(st.generations[1].people[0].note === '长房', '场景6：备注已更新');

  // ===== 场景7：编辑改名同步父系引用 =====
  dom = await makeDOM([]);
  w = dom.window;
  w.openEdit(1, 0);                 // 编辑玘 → 改名为 璂
  w.document.getElementById('aName').value = '璂';
  w.submitEdit(1, 0);
  st = getState(w);
  assert(st.generations[1].people[0].givenName === '璂', '场景7：名字已改为璂');
  assert(st.generations[0].people[0].sons[0].givenName === '璂', '场景7：父系子嗣条目名字同步改为璂');

  // ===== 场景8：几子几女只读统计（按填写内容）+ 性别添加（默认男可选女）=====
  dom = await makeDOM([]);
  w = dom.window;
  // 8a. 卡片无任何数量输入栏；世昌（子3）、玘（子2）、旺/兴无统计
  assert(w.document.querySelectorAll('#tree .cntInput').length === 0,
    '场景8a：卡片无数值输入栏（几子几女不可调整）');
  let nms8 = [...w.document.querySelectorAll('#tree .node .nm')].map(e => e.textContent);
  assert(nms8.some(t => t.startsWith('世昌') && t.includes('（子3）')), '场景8a：世昌 只读显示（子3）');
  assert(nms8.some(t => t.startsWith('玘') && t.includes('（子2）')), '场景8a：玘 只读显示（子2）');
  assert(!nms8.some(t => t.startsWith('旺') && t.includes('子')), '场景8a：无子女者不显示统计');
  // 添加时性别默认为男
  w.openAdd();
  assert(w.document.querySelector('input[name="asex"][value="m"]').checked, '场景8a：添加时性别默认为男');
  w.closeDlg();
  // 8b. 添加女性（性别选女）→ 按内容计入「女」
  w.document.getElementById('aName').value = '淑英';
  w.document.querySelector('input[name="asex"][value="f"]').checked = true;
  w.document.getElementById('aGen').value = '1';
  w.document.getElementById('aFather').value = '0:0';
  w.submitAdd();
  st = getState(w);
  const fEntry = st.generations[0].people[0].sons.find(s => s.givenName === '淑英');
  assert(fEntry && fEntry.sex === 'f', '场景8b：添加的女性写入父系子嗣条目');
  nms8 = [...w.document.querySelectorAll('#tree .node .nm')].map(e => e.textContent);
  assert(nms8.some(t => t.startsWith('世昌') && t.includes('（子3 女1）')), '场景8b：统计自动变为 子3 女1');
  // 8c. 再添加儿子 → 绑定子嗣位，统计 子4 女1
  w.document.getElementById('aName').value = '阿大';
  w.document.querySelector('input[name="asex"][value="m"]').checked = true;
  w.document.getElementById('aGen').value = '1';
  w.document.getElementById('aFather').value = '0:0';
  w.submitAdd();
  st = getState(w);
  const sc8 = st.generations[0].people[0];
  assert(sc8.sons.some(s => s.givenName === '阿大' && s.sex === 'm'), '场景8c：添加的儿子绑定到子嗣位');
  nms8 = [...w.document.querySelectorAll('#tree .node .nm')].map(e => e.textContent);
  assert(nms8.some(t => t.startsWith('世昌') && t.includes('（子4 女1）')), '场景8c：统计随填写内容变为 子4 女1');
  // 8d. 已录名女儿条目：统计按内容计入；开关只控制树上是否显示名字
  w.eval(`DATA.generations[0].people[0].sons.push({givenName:'静姝', sex:'f'}); saveData(); render();`);
  nms8 = [...w.document.querySelectorAll('#tree .node .nm')].map(e => e.textContent);
  assert(nms8.some(t => t.startsWith('世昌') && t.includes('女2')), '场景8d：统计按内容计入女儿（女2）');
  assert(!nms8.some(t => t.includes('静姝')), '场景8d：开关默认关闭 → 女儿名字不上树');
  w.toggleFemale(true);
  nms8 = [...w.document.querySelectorAll('#tree .node .nm')].map(e => e.textContent);
  assert(nms8.some(t => t.includes('静姝')), '场景8d：开关打开 → 显示女儿静姝');
  w.toggleFemale(false);
  // 8e. 删除成员 → 统计自动回落
  confirmQueue = [true];
  w.openQuery(); w.doQuery('阿大');
  w.document.querySelector('#queryResult .delBtn').click();
  st = getState(w);
  nms8 = [...w.document.querySelectorAll('#tree .node .nm')].map(e => e.textContent);
  assert(nms8.some(t => t.startsWith('世昌') && t.includes('（子3 女2）')), '场景8e：删除儿子后统计自动回落 子3 女2');
  // 8f. 从右往左、最右为最大：长子聚才 x > 次子得才 x
  const cards8 = [...w.document.querySelectorAll('#tree .node')];
  const jc = cards8.find(n => n.querySelector('.nm').textContent.startsWith('聚才'));
  const dc = cards8.find(n => n.querySelector('.nm').textContent.startsWith('得才'));
  assert(jc && dc && parseFloat(jc.style.left) > parseFloat(dc.style.left),
    '场景8f：长子聚才在次子得才右侧（最右为最大）');

  // ===== 场景9：旧数据（v2）迁移 —— 玘下面的「女」误判全部清零，子嗣位都是子 =====
  const dom9 = new JSDOM(html, {
    url: 'http://localhost/', runScripts: 'dangerously', pretendToBeVisual: true,
    beforeParse(win) {
      // 模拟旧版本留下的脏数据：玘 名下有未命名女性占位 + 女=2 计数
      win.localStorage.setItem('zupu_data_v2', JSON.stringify({
        surname: '路', introText: '',
        generations: [
          { title: '第一世', people: [ { givenName: '世昌', spouse: '赵氏',
            sons: [ { givenName: '玘', sex: 'm' }, { givenName: '', sex: 'm' }, { givenName: '', sex: 'f' } ] } ] },
          { title: '第二世', people: [ { givenName: '玘', spouse: '王氏李氏',
            sons: [ { givenName: '聚才', sex: 'm' }, { givenName: '得才', sex: 'm' }, { givenName: '', sex: 'f' } ],
            daughters: 2 } ] },
        ],
      }));
    },
  });
  await new Promise(res => {
    const ww = dom9.window;
    if (ww.document.readyState === 'complete') res(); else ww.addEventListener('load', res);
  });
  const w9 = dom9.window;
  w9.eval('saveData()');   // 触发迁移后的数据写入 v3
  st = getState(w9);
  const qi9 = st.generations[1].people[0];
  assert(qi9.sons.length === 2 && qi9.sons.every(s => s.sex !== 'f') && qi9.daughters === 0,
    '场景9：玘 迁移后 子嗣位=[聚才,得才] 全为子、误判的「女=2」清零');
  const qc9 = st.generations[0].people[0];
  assert(qc9.sons.length === 2 && qc9.sons.every(s => s.sex !== 'f') && qc9.daughters === 0,
    '场景9：世昌 未命名女性占位清除、子嗣位全为子');
  assert(w9.localStorage.getItem('zupu_data_v3') !== null, '场景9：迁移结果已写入 v3，旧键弃用');
  // 树上无任何「待录」女性节点
  w9.toggleFemale(true);
  const nm9 = [...w9.document.querySelectorAll('#tree .node .nm')].map(e => e.textContent).join(',');
  assert(!nm9.includes('长女') && !nm9.includes('次女'), '场景9：开启开关也不出现任何女性占位节点');

  // ===== 场景10：生卒时间 + 世代悬浮标签 + 右对齐 =====
  dom = await makeDOM([]);
  w = dom.window;
  w.openEdit(0, 0);   // 编辑世昌
  w.document.getElementById('aBirth').value = '明万历三年';
  w.document.getElementById('aDeath').value = '清顺治五年';
  w.submitEdit(0, 0);
  st = getState(w);
  assert(st.generations[0].people[0].birth === '明万历三年' && st.generations[0].people[0].death === '清顺治五年',
    '场景10a：生卒时间已保存');
  const txt10 = [...w.document.querySelectorAll('#tree .node')].map(n => n.textContent).join('|');
  assert(txt10.includes('明万历三年 – 清顺治五年'), '场景10a：卡片显示生卒时间');
  // 新增成员时填生卒
  w.document.getElementById('aName').value = '有后';
  w.document.getElementById('aBirth').value = '1900';
  w.document.getElementById('aGen').value = 'new';
  w.submitAdd();
  st = getState(w);
  const yh = st.generations.flatMap(g => g.people).find(p => p.givenName === '有后');
  assert(yh && yh.birth === '1900', '场景10b：新增成员带生卒字段');
  // 世代悬浮标签存在
  const gf = w.document.getElementById('genFloat');
  assert(gf !== null && gf.textContent.includes('第'), '场景10c：世代悬浮标签存在并显示世代');
  // 卡片内容右对齐
  const css10 = w.document.querySelector('style').textContent;
  assert(/\.node\s*{[^}]*text-align:\s*right/.test(css10), '场景10d：卡片内容靠右对齐');

  // ===== 场景11：所属世代 / 父亲可修改 =====
  dom = await makeDOM([]);
  w = dom.window;
  // 11a. 改父亲：得才 从 玘(1:0) 换挂到 旺(1:1)
  w.openEdit(2, 1);                      // 得才
  w.document.getElementById('aFather').value = '1:1';
  w.submitEdit(2, 1);
  st = getState(w);
  const decai = st.generations[2].people.find(p => p.givenName === '得才');
  const qi11 = st.generations[1].people[0];
  const wang11 = st.generations[1].people[1];
  assert(!!decai, '场景11a：得才仍存在于第二世（未丢人）');
  assert(!qi11.sons.some(s => s.givenName === '得才'), '场景11a：旧父亲玘的子嗣条目已移除得才');
  assert(wang11.sons.filter(s => s.givenName === '得才').length === 1, '场景11a：新父亲旺名下恰有一条得才（不重复）');
  // 11b. 成环拦截：把世昌的父亲设为自己的后代玘 → 拦截且不产生任何改动
  w.openEdit(0, 0);                      // 世昌
  w.document.getElementById('aFather').value = '1:0';
  w.submitEdit(0, 0);
  st = getState(w);
  const sc11 = st.generations[0].people.find(p => p.givenName === '世昌');
  assert(alertLog.some(m => m.includes('成环')), '场景11b：弹出了成环警告');
  assert(!!sc11, '场景11b：世昌未被移动/删除（守卫在改动前生效）');
  assert(!st.generations.flatMap(g => g.people).some(p => (p.sons || []).some(s => s.givenName === '世昌')),
    '场景11b：世昌没有被挂到任何父亲名下（未半保存）');
  // 11c. 改世代：世昌 连同已录名后代整支迁往第三世（new → 新建）
  w.openEdit(0, 0);
  w.document.getElementById('aFather').value = '';
  w.document.getElementById('aGen').value = 'new';
  w.submitEdit(0, 0);
  st = getState(w);
  const flat11 = st.generations.map((g, i) => ({ i, names: g.people.map(p => p.givenName) }));
  const genSC = st.generations.findIndex(g => g.people.some(p => p.givenName === '世昌'));
  const genQI = st.generations.findIndex(g => g.people.some(p => p.givenName === '玘'));
  const genJC = st.generations.findIndex(g => g.people.some(p => p.givenName === '聚才'));
  assert(genSC >= 2, '场景11c：世昌已迁出第一世（' + (genSC + 1) + '世）');
  assert(genQI === genSC + 1, '场景11c：玘随迁为世昌下一世');
  assert(genJC === genQI + 1, '场景11c：聚才随迁为玘下一世（整支级联）');
  assert(st.generations[0].people.length === 0, '场景11c：第一世已空（无残留幽灵节点）');
  // 11d. 父亲不变重复保存：不产生重复子嗣条目
  w.openEdit(2, 0);                      // 此位置应为玘（随迁后）
  const qiIdx11 = st.generations[genSC + 1].people.findIndex(p => p.givenName === '玘');
  w.openEdit(genSC + 1, qiIdx11);
  w.submitEdit(genSC + 1, qiIdx11);      // 未改任何父系字段，直接保存
  st = getState(w);
  const qi11d = st.generations[genSC + 1].people[qiIdx11];
  const wang11d = st.generations[genSC + 1].people.find(p => p.givenName === '旺');
  assert(qi11d.sons.filter(s => s.givenName === '聚才').length === 1 &&
         wang11d.sons.filter(s => s.givenName === '得才').length === 1,
    '场景11d：重复保存不产生重复子嗣条目（linkFather 去重生效）');

  // ===== 场景12：长子最右、依次往左（顺序保障）=====
  dom = await makeDOM([]);
  w = dom.window;
  // 12a. 弹窗新增：数组里有「排在兄长前面的空位」时，不填该空位，而是追加到末尾（最幼=最左）
  w.eval(`DATA.generations[1].people[0].sons = [{givenName:'',sex:'m'},{givenName:'仲和',sex:'m'}]; saveData(); render();`);
  w.eval(`reallyAdd('叔明','','','2','1:0','m',null,'','');`);
  st = getState(w);
  const sc12 = st.generations[1].people[0].sons;
  assert(sc12.length === 3 && sc12[2].givenName === '叔明' && sc12[0].givenName === '',
    '场景12a：弹窗新增追加到末尾，不插到已录名兄长之前的空位');
  // 视觉：叔明（更幼）应在仲和左侧
  const nms12 = [...w.document.querySelectorAll('#tree .node')];
  const leftOf = nm => { const el = nms12.find(n => n.textContent.includes(nm)); return el ? parseFloat(el.style.left) : null; };
  assert(leftOf('叔明') !== null && leftOf('仲和') !== null && leftOf('叔明') < leftOf('仲和'),
    '场景12a：视觉上叔明在仲和左侧（幼者靠左）');
  // 12b. 兄弟排序按钮：玘左移（更年幼）→ 数组换位；再右移回最右（更年长）
  w.openEdit(1, 0);            // 玘（世昌长子，sons[0]）
  w.eval('reorderSibling(1)'); // 左移一位
  st = getState(w);
  const s12 = st.generations[0].people[0].sons;
  assert(s12[0].givenName === '旺' && s12[1].givenName === '玘',
    '场景12b：玘左移后排在旺之后（数组位次=长幼位次）');
  w.eval('reorderSibling(-1)'); // 右移回最右
  st = getState(w);
  const s12b = st.generations[0].people[0].sons;
  assert(s12b[0].givenName === '玘' && s12b[1].givenName === '旺' && s12b[2].givenName === '兴',
    '场景12b：玘右移恢复长子位（最右）');
  // 12c. 视觉验证：长子玘在兄弟中最右
  const left12 = {};
  [...w.document.querySelectorAll('#tree .node')].forEach(n => {
    ['玘', '旺', '兴'].forEach(nm => { if (n.textContent.includes(nm) && !(nm in left12)) left12[nm] = parseFloat(n.style.left); });
  });
  assert(left12['玘'] > left12['旺'] && left12['旺'] > left12['兴'],
    '场景12c：视觉顺序 兴 < 旺 < 玘（长子最右，依次往左）');

  // ===== 场景13：继子（过继）标注 =====
  dom = await makeDOM([]);
  w = dom.window;
  // 13a. 编辑勾选「继子」→ 人物与父亲子嗣条目均带 adopt，卡片显示继子
  w.openEdit(2, 0);            // 聚才（父：玘）
  w.document.getElementById('aAdopt').checked = true;
  w.submitEdit(2, 0);
  st = getState(w);
  const jc13 = st.generations[2].people[0];
  assert(jc13.adopt === true, '场景13a：聚才人物记录带继子标记');
  assert(st.generations[1].people[0].sons.find(s => s.givenName === '聚才').adopt === true,
    '场景13a：父亲玘的子嗣条目同步继子标记');
  const nm13 = [...w.document.querySelectorAll('#tree .node')].map(n => n.textContent).join('|');
  assert(!/聚才.*继子/.test(nm13.replace(/\s/g, '')), '场景13a：卡片名字后不再显示「继子」（改到连线上）');
  const lineTag13 = [...w.document.querySelectorAll('#tree .adoptLineTag')].find(t => t.textContent === '继子');
  assert(!!lineTag13 && lineTag13.style.left && lineTag13.style.top, '场景13a：连线上出现「继子」标注');
  // 13b. 取消勾选 → 标记同步移除
  w.openEdit(2, 0);
  w.document.getElementById('aAdopt').checked = false;
  w.submitEdit(2, 0);
  st = getState(w);
  assert(st.generations[2].people[0].adopt === undefined &&
         st.generations[1].people[0].sons.find(s => s.givenName === '聚才').adopt === undefined,
    '场景13b：取消勾选后人物与子嗣条目的继子标记均移除');
  // 13c. 新建时勾选继子 → 新人物与父系条目均带标记
  w.openEdit(0, 0);
  w.document.getElementById('aName').value = '朋之';
  w.document.getElementById('aAdopt').checked = true;
  w.document.getElementById('aGen').value = '1';
  w.document.getElementById('aFather').value = '0:0';
  w.submitAdd();
  st = getState(w);
  const pz = st.generations[1].people.find(p => p.givenName === '朋之');
  assert(pz && pz.adopt === true, '场景13c：新建朋之勾选继子后记录带标记');
  assert(st.generations[0].people[0].sons.find(s => s.givenName === '朋之').adopt === true,
    '场景13c：父亲子嗣条目同步继子标记');
  const lineTag13b = [...w.document.querySelectorAll('#tree .adoptLineTag')].filter(t => t.textContent === '继子');
  assert(lineTag13b.length === 1, '场景13c：朋之的连线上显示「继子」标注（13b已移除聚才的，此处仅剩1处）');
  // 13d. 取消勾选后连线标注消失
  const pzNode = [...w.document.querySelectorAll('#tree .node')].find(n => n.textContent.includes('朋之'));
  const giPz = 1, piPz = st.generations[1].people.findIndex(p => p.givenName === '朋之');
  w.openEdit(giPz, piPz);
  w.document.getElementById('aAdopt').checked = false;
  w.submitEdit(giPz, piPz);
  const left13 = [...w.document.querySelectorAll('#tree .adoptLineTag')].length;
  assert(left13 < lineTag13b.length, '场景13d：取消勾选后连线上的继子标注移除');

  // ===== 场景14：编辑弹窗「子的数量」直接加减 =====
  dom = await makeDOM([]);
  w = dom.window;
  // 14a. 编辑模式显示步进器，添加模式隐藏
  w.openAdd();
  assert(w.document.getElementById('addSonRow').style.display === 'none', '场景14a：添加模式不显示「子的数量」');
  w.openEdit(0, 0);            // 世昌（现有3个录名子）
  assert(w.document.getElementById('addSonRow').style.display !== 'none', '场景14a：编辑模式显示「子的数量」');
  assert(w.document.getElementById('sonCountDisp').textContent === '3', '场景14a：步进器初始值=录名子数3');
  // 14b. ＋ → sonCount=4，卡片显示 子4，树上不生成新节点
  const phBefore14 = w.document.querySelectorAll('#tree .node.ph').length;
  w.adjustSonCount(1);
  st = getState(w);
  assert(st.generations[0].people[0].sonCount === 4, '场景14b：＋后 sonCount=4');
  const nm14 = [...w.document.querySelectorAll('#tree .node')].map(n => n.textContent).join('|');
  assert(/世昌[^|]*子4/.test(nm14.replace(/\s/g, '')), '场景14b：卡片统计显示 子4');
  assert(w.document.querySelectorAll('#tree .node.ph').length === phBefore14,
    '场景14b：未录名的子不生成树上节点（非占位）');
  // 14c. － 回到3 → sonCount 删除（与录名数一致）；再－ → 拦截
  w.adjustSonCount(-1);
  st = getState(w);
  assert(st.generations[0].people[0].sonCount === undefined, '场景14c：－到录名数后 sonCount 字段移除');
  const alertBefore14 = alertLog.length;
  w.adjustSonCount(-1);
  st = getState(w);
  assert(alertLog.length > alertBefore14 && st.generations[0].people[0].sonCount === undefined,
    '场景14c：低于录名子数时拦截并提示');
  // 14d. 数据迁移兼容：无 sonCount 的旧记录统计不变
  assert(st.generations[1].people[0].sonCount === undefined, '场景14d：旧记录无 sonCount 字段');

  console.log('\n全部测试完成。');
})();
