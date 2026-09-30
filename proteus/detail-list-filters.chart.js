// ============================================================================
// detail-list-filters.chart.js — панель фильтров «Детальных списков» (слева от чарта списка)
// ============================================================================
// КОНТРАКТ PROTEUS:
//   ECharts = только холст. Вся визуализация - HTML/CSS/SVG в overlay.
//   Хост = ПОСЛЕДНИЙ [_echarts_instance_]. Canvas прячем. Overlay - appendChild.
//   В САМОМ КОНЦЕ ФАЙЛА, ГЛОБАЛЬНО: option = {...} с пустым scatter.
//
// ЗАПРЕЩЕНО: backticks/template-literals, стрелочные функции, let/const,
//   document.getElementById (только overlay.querySelector), console.log в итоге,
//   addEventListener внутри тела render(), обращение к option из catch,
//   мутация option после присваивания, var P = '.' + CFG.ns в buildHTML
//   (точка только в buildCSS).
// ОБЯЗАТЕЛЬНО: все 7 блоков ниже, в таком порядке, без перенумерации.
// ОБЯЗАТЕЛЬНО: вызов render(); в теле mount() — без него overlay пустой.
//
// ЧТО ЭТО. Вертикальная панель слева от списка: фильтры по разделам нативных фильтров борда 7241, в
//   разделе — по два в ряд. Клик по фильтру — широкая выпадашка справа от панели, поверх списка.
// КУБ. Датасет панели (proteus/detail-list.data.sql, VIEW = 'filters') отдаёт всех сотрудников периода
//   кодами значений всех фильтров (роль C), словари значений (D) и деревья УС / ЮС / КП целиком (T).
//   Счётчики «при остальных фильтрах» чарт считает сам по НАБРАННОМУ выбору — ещё до «Применить»:
//   выбрали значение — остальные фильтры сразу показывают, что под ним осталось, пустое прячется.
//   Куб не зависит ни от одного фильтра, поэтому панель НЕ фильтрует сама себя: «Применить» уходит только
//   в список, применённое панель держит у себя (state.applied) и сверяет с эхом списка (DL_ECHO).
//   Куб — действующие сотрудники на последний день: ни «Период», ни «Сотрудники по списку» его не меняют
//   (решение владельца) — они действуют только на список.
// ВЫПАДАШКА ПОВЕРХ СПИСКА — костыль борда Proteus Adoption (строка ЦА, pa-ca-bar): чарт живёт в
//   <iframe sandbox> размером с ячейку, единственный канал к родителю — postMessage
//   ECHARTS_UPDATE_DATA_URL (канал скриншотов). Открыли выпадашку → PNG 1×1 с маркером CFG.overlay.mark;
//   CSS борда (`:has(img.echarts-plugin[src*=маркер])`) разворачивает iframe вправо прозрачным слоем
//   поверх списка. Закрыли → чистый PNG. Подсказки iframe НЕ разворачивают (они помещаются в панель).
// СПИСОК УЗНАЁТ О ЗАПРОСЕ СРАЗУ: «Применить» рассылает соседним iframe DL_FLT {cf, frq}; чарт списка той
//   же вкладки (тот же cf) показывает «Обновляю…», пока в его ответе нет той же метки frq.
// ============================================================================

// ---------- БЛОК 1: CFG ----------
// Один файл на обе вкладки: у панели вкладки КП в файле поставки ns 'dlkf'.
var CFG = {
  ns: 'dlf',
  mode: 'snapshot',
  fields: { role: 'role', k: 'k', v: 'v', n: 'n', j: 'j' },
  // Численность и тип ЮЛ — коды куба: бит у сотрудника (emp = legal + 2·active, tcr = rus + 2·foreign + 4·tcr_flg).
  emp: [{ v: 'Юридическая', bit: 1 }, { v: 'Активная', bit: 2 }],
  tcr: [{ v: 'ТЦР РФ', bit: 1 }, { v: 'ТЦР СНГ', bit: 2 }, { v: 'ТЦР РФ + ТЦР СНГ', bit: 4 }],
  // Пределы — как у датасета списка: лишнее он отбросит, чарт не даёт набрать больше.
  maxVals: 200, maxValsTotal: 500, maxIds: 2000,
  listMax: 400,                // значений в списке выпадашки за раз
  treeRowsMax: 900,            // строк дерева за раз
  searchMin: 2,
  // Структуры — поле на всю строку, фиолетовый акцент: фильтр действует на всё дерево (узел и всё ниже).
  trees: [
    { key: 'mu', label: 'Управленческая структура', name: 'Управленческая структура', max: 50 },
    { key: 'lu', label: 'Юридическая структура', name: 'Юридическая структура', max: 50 },
    { key: 'kp', label: 'Каталог продуктов', name: 'Каталог продуктов', max: 20 }
  ],
  // Разделы и порядок — нативных фильтров борда 7241 (к ним привыкли пользователи); в разделе — по два в ряд.
  // fold — раздел свёрнут по умолчанию (видно, какие ещё есть фильтры).
  shelf: [
    { name: 'Основные', keys: ['per', 'ids', 'emp', 'active_type_nm', 'employment_relation_type_desc', 'employee_contract_type_desc',
      'residential_state_nm', 'office_desc', 'emp_specialization_oper_code', 'emp_specialization_it_code', 'emp_stream_desc',
      'emp_specialization_desc'] },
    { name: 'Управленческая структура', keys: ['mu', 'management_head_flg', 'hrbp_login'] },
    { name: 'Юридическая структура', keys: ['lu', 'regional_hr_login', 'employee_main_contract_type_nm', 'tcr'] },
    { name: 'Атрибуты найма', keys: ['mapping_channel_name', 'respond_source_nm'] },
    { name: 'Каталог продуктов', keys: ['kp'] },
    { name: 'Региональные атрибуты', keys: ['location_type', 'macroregion_nm', 'city_nm', 'tcr_exist_flg'] },
    { name: 'Другие атрибуты', fold: true, keys: ['t_education_desc', 'company_fire_flg', 'rb_flg', 'rb_migration_flg', 'legal_position_nm',
      'subordination_lvl', 'head_lvl_segment'] }
  ],
  facetLabels: {
    active_type_nm: 'Тип численности', employment_relation_type_desc: 'Тип оформления', employee_contract_type_desc: 'Тип договора',
    employee_main_contract_type_nm: 'Тип договора (штат)', legal_position_nm: 'Должность', subordination_lvl: 'Положение в структуре',
    company_fire_flg: 'Уволен на отчётную дату', t_education_desc: 'T-образование',
    emp_specialization_oper_code: 'HQ | Line | Support', emp_specialization_it_code: 'IT | non-IT', emp_stream_desc: 'Стрим',
    emp_specialization_desc: 'Специализация', management_head_flg: 'Руководитель УС', head_lvl_segment: 'Сегмент руководителя',
    hrbp_login: 'Логин HRBP', regional_hr_login: 'Логин рег HR', location_type: 'Локация', macroregion_nm: 'Макрорегион',
    residential_state_nm: 'Регион', city_nm: 'Город', office_desc: 'Офис', tcr_exist_flg: 'В локации хаба',
    mapping_channel_name: 'Источник привлечения', respond_source_nm: 'Детализированный источник', rb_flg: 'Росбанк',
    rb_migration_flg: 'Росбанк (MNA)'
  },
  flagFacets: ['company_fire_flg', 'management_head_flg', 'tcr_exist_flg', 'rb_flg', 'rb_migration_flg'],
  idKinds: [
    { key: 'rk', label: 'MasterID', hint: 'только цифры' },
    { key: 'login', label: 'Логин', hint: 'регистр не важен' },
    { key: 'tab', label: 'Табельный', hint: 'как в 1С' },
    { key: 'siebel', label: 'Siebel ID', hint: 'основной' }
  ],
  // Ширина выпадашки по виду фильтра, px (не шире места справа от панели).
  widths: { tree: 2000, facet: 420, one: 320, ids: 540 },
  overlay: {
    // «DL-FLT-DD-ON» в base64: 12 байт = ровно 16 знаков, стоит в строке PNG как есть.
    mark: 'REwtRkxULURELU9O',
    png: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='
  },
  text: {
    noData: 'Нет данных',
    noAccess: 'Для вашего логина нет строки в таблице доступа warden — фильтры недоступны.',
    noCf: 'Фильтры не применились: нет applyCrossFilter (откройте чарт на дашборде).',
    idsNote: 'Числа — без «Сотрудников по списку»: список сотрудников применится в самом списке.',
    perNote: 'Числа фильтров — по действующим сотрудникам, от «Периода» не зависят; итог на дату — в списке.'
  },
  // Токены — профиль Proteus Adoption, как у чарта списка.
  colors: {
    bg: '#f4f5f7', card: '#ffffff', line: '#e7e9ee', line2: '#eef0f3',
    ink: '#23272e', ink2: '#454b55', muted: '#8a909c', muted2: '#aab0bb',
    warnTx: '#9a6500', blue: '#3b6fe0', blueBg: '#eef3fe', blueTx: '#2b5fd0', act: '#2b6cff', actInk: '#1f55d6', hl: '#dfe8ff',
    // структуры (всё дерево) — фиолетовый акцент с лёгким градиентом
    vio: '#6d4ae0', vioTx: '#5a3bc4', vioBg1: '#f4f0ff', vioBg2: '#ebe4ff', vioLine: '#d9cffb'
  },
  // Кегли — роли профиля Adoption, веса 400 / 500 / 600. Поле фильтра — две строки (подпись + выбор), 40 px.
  fonts: { family: 'Inter,-apple-system,"Segoe UI",Roboto,Arial,sans-serif', micro: 9.5, cap: 10.5, note: 11.5, control: 12, body: 12.5, title: 14.5 },
  spacing: { fieldH: 40, gap: 6, pad: 12, ddGap: 8, ddMin: 280 }
};

// ---------- БЛОК 2: ВХОД + СОСТОЯНИЕ + ХЕЛПЕРЫ ----------
var rawData = (typeof data !== 'undefined' && Array.isArray(data)) ? data : [];

if (!window.__pvtState) window.__pvtState = {};
var __S = window.__pvtState;
var STATE0 = {
  tip: null,
  open: '',          // открытая выпадашка: per | emp | tcr | ids | mu | lu | kp | f:<атрибут> | ''
  q: '',             // поиск в выпадашке
  stage: null,       // набранное, но не применённое — копия applied() с правками
  treeOpen: {}, idKind: 'rk', idBad: 0,
  fold: {},          // свёрнутые / развёрнутые разделы панели (нет ключа — как в CFG.shelf)
  zeros: {},         // показать значения без сотрудников (по ключу фильтра)
  applied: null,     // применённое (панель себя не фильтрует — держит сама, сверяет с эхом списка)
  lastFrq: '',       // метка последнего «Применить» — эхо списка с другой меткой устарело
  rqN: 0, warn: '',
  baseW: 0, sig: false, pin: false
};
if (!__S[CFG.ns]) __S[CFG.ns] = {};
for (var k0 in STATE0) if (STATE0.hasOwnProperty(k0) && !__S[CFG.ns].hasOwnProperty(k0)) __S[CFG.ns][k0] = STATE0[k0];
var state = __S[CFG.ns];

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}
// Числа из BI приходят и числом, и строкой с пробелами-разрядами или запятой.
function num(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return isNaN(v) ? null : v;
  var s = String(v).replace(/[\s ]/g, '');
  if (s.indexOf(',') > -1 && s.indexOf('.') === -1) s = s.replace(/,/g, '.');
  else s = s.replace(/,/g, '');
  var n = Number(s);
  return isNaN(n) ? null : n;
}
// Универсальный парсер даты: epoch-ms, epoch-s, 'YYYY-MM-DD', 'YYYY-MM'.
function toDate(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  var s = String(raw).trim(), d = null;
  if (/^\d{11,}$/.test(s)) { var ms = Number(s); d = new Date(ms > 1e12 ? ms : ms * 1000); }
  else if (/^\d{10}$/.test(s)) d = new Date(Number(s) * 1000);
  else {
    var m = /^(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(s);
    if (m) return { y: +m[1], m: +m[2] - 1, d: m[3] ? +m[3] : 1 };
    d = new Date(s);
  }
  if (!d || isNaN(d.getTime())) return null;
  return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate() };
}
function trim(s) { return String(s == null ? '' : s).replace(/^\s+|\s+$/g, ''); }
function lower(s) { return String(s == null ? '' : s).toLowerCase().replace(/ё/g, 'е'); }
function inArr(a, v) { return (a || []).indexOf(v) > -1; }
function sameSet(a, b) {
  a = a || []; b = b || [];
  if (a.length !== b.length) return false;
  for (var i = 0; i < a.length; i++) if (b.indexOf(a[i]) < 0) return false;
  return true;
}
function uniq(a) {
  var out = [], seen = {};
  for (var i = 0; i < (a || []).length; i++) if (!seen['~' + a[i]]) { seen['~' + a[i]] = 1; out.push(a[i]); }
  return out;
}
function parseJSON(s) { try { return JSON.parse(s); } catch (e) { return null; } }
// Пачки: base64 от UTF-8 — встроенными atob + TextDecoder.
var UTF8 = (typeof TextDecoder !== 'undefined') ? new TextDecoder('utf-8') : null;
function b64utf8(s) {
  if (!s) return '';
  var bin = atob(String(s));
  if (!UTF8) return decodeURIComponent(escape(bin));
  var n = bin.length, u = new Uint8Array(n);
  for (var i = 0; i < n; i++) u[i] = bin.charCodeAt(i);
  return UTF8.decode(u);
}
// Значение словаря: \\ \n \r экранированы обратным слэшем.
function unescV(s) {
  return s.indexOf('\\') < 0 ? s : s.replace(/\\(.)/g, function (m, c) { return c === 'n' ? '\n' : c === 'r' ? '\r' : c; });
}

// ---------- БЛОК 3: ТРАНСФОРМАЦИЯ ДАННЫХ ----------
var ID_KEYS = [];
for (var ik = 0; ik < CFG.idKinds.length; ik++) ID_KEYS.push(CFG.idKinds[ik].key);
function splitEq(list, keys) {
  var out = {};
  for (var i = 0; keys && i < keys.length; i++) out[keys[i]] = [];
  for (var j = 0; j < (list || []).length; j++) {
    var s = String(list[j]), at = s.indexOf('=');
    if (at < 0) continue;
    var a = s.slice(0, at);
    if (!out[a]) out[a] = [];
    out[a].push(s.slice(at + 1));
  }
  return out;
}
function treeDef(tk) { for (var i = 0; i < CFG.trees.length; i++) if (CFG.trees[i].key === tk) return CFG.trees[i]; return CFG.trees[0]; }
function isTreeKey(k) { return k === 'mu' || k === 'lu' || k === 'kp'; }
// Узлы дерева из пачек (порядок обхода в глубину): родитель — ближайший выше узел меньшего уровня;
// end — последний потомок (поддерево — отрезок [i, end]); лист — узел, на котором кончается чей-то путь,
// k-й лист — код k в кубе. У КП id узла — его путь именами через \x1F: он же значение фильтра.
function buildTree(tk, chunks) {
  chunks.sort(function (a, b) { return a.c - b.c; });
  var nodes = [], by = {}, roots = [], stack = [], leaf = [0];
  for (var c = 0; c < chunks.length; c++) {
    var lines = b64utf8(chunks[c].j).split('\n');
    for (var li = 0; li < lines.length; li++) {
      if (lines[li] === '') continue;
      var p = lines[li].split('\t'), x;
      if (tk === 'kp') x = { lvl: +p[0] || 0, own: p[1] === '1', name: p[2] || '' };
      else x = { id: p[0], lvl: +p[1] || 0, own: p[2] === '1', name: p[3] || '' };
      while (stack.length && stack[stack.length - 1].lvl >= x.lvl) { nodes[stack[stack.length - 1].ix].end = nodes.length - 1; stack.pop(); }
      var par = stack.length ? stack[stack.length - 1] : null;
      x.par = par ? par.ix : -1;
      if (tk === 'kp') x.id = (par ? par.id + '\x1f' : '') + x.name;
      x.ix = nodes.length;
      x.kids = [];
      stack.push(x);
      nodes.push(x);
      by[x.id] = x.ix;
      if (par) par.kids.push(x.ix); else roots.push(x.ix);
      if (x.own) leaf.push(x.ix);
    }
  }
  while (stack.length) { nodes[stack[stack.length - 1].ix].end = nodes.length - 1; stack.pop(); }
  var byName = function (a, b) { return String(nodes[a].name).localeCompare(String(nodes[b].name), 'ru'); };
  roots.sort(byName);
  for (var i = 0; i < nodes.length; i++) if (nodes[i].kids.length > 1) nodes[i].kids.sort(byName);
  return { nodes: nodes, by: by, roots: roots, leaf: leaf };
}
// Коды сотрудников: фиксированная ширина w знаков алфавита (старший разряд первым).
function alphaMap(alph) {
  var m = new Int16Array(128);
  for (var i = 0; i < 128; i++) m[i] = -1;
  for (var j = 0; j < alph.length; j++) m[alph.charCodeAt(j)] = j;
  return m;
}
function decodeFixed(str, w, A, out, off) {
  var n = Math.floor(str.length / w);
  for (var i = 0, p = 0; i < n; i++) {
    var v = 0;
    for (var d = 0; d < w; d++) v = v * 64 + A[str.charCodeAt(p++)];
    out[off + i] = v;
  }
  return n;
}
// Несколько кодов у сотрудника (рег. HR, КП): сотрудники через '.', коды подряд.
function decodeMulti(chunks, N, A, map) {
  var off = new Uint32Array(N + 1), vals = [], e = 0;
  for (var c = 0; c < chunks.length; c++) {
    var parts = chunks[c].j.split('.'), w = chunks[c].w;
    for (var i = 0; i < parts.length && e < N; i++, e++) {
      off[e] = vals.length;
      var s = parts[i];
      for (var p = 0; p + w <= s.length; p += w) {
        var v = 0;
        for (var d = 0; d < w; d++) v = v * 64 + A[s.charCodeAt(p + d)];
        vals.push(map ? map(v) : v);
      }
    }
  }
  for (; e <= N; e++) off[e] = vals.length;
  return { off: off, vals: new Int32Array(vals) };
}
function buildModel() {
  var F = CFG.fields, M = { ok: false, err: '', missing: [], mode: 'us', cf: '_f', m: {}, a: {}, dates: [], total: 0,
    dict: {}, code: {}, cube: {}, multi: {}, trees: {}, N: 0, applied: null };
  if (!rawData.length) { M.err = 'empty'; return M; }
  var r0 = rawData[0], need = ['role', 'k', 'v', 'n', 'j'];
  for (var i = 0; i < need.length; i++) if (!r0.hasOwnProperty(F[need[i]])) M.missing.push(F[need[i]]);
  if (M.missing.length) { M.err = 'columns'; return M; }
  var meta = null, tch = {}, cch = {};
  for (var r = 0; r < rawData.length; r++) {
    var row = rawData[r], role = row[F.role];
    var k = row[F.k] == null ? '' : String(row[F.k]), v = row[F.v] == null ? '' : String(row[F.v]);
    var n = num(row[F.n]) || 0, j = row[F.j] == null ? '' : String(row[F.j]);
    if (role === 'meta') { meta = parseJSON(j); M.mode = k === 'kp' ? 'kp' : 'us'; M.total = n; }
    else if (role === 'D') {
      var vals = b64utf8(j).split('\n'), cm = {};
      if (+v === 0) vals = [];
      for (var d = 0; d < vals.length; d++) { vals[d] = unescV(vals[d]); cm['~' + vals[d]] = d; }
      M.dict[k] = vals;
      M.code[k] = cm;
    }
    else if (role === 'T') { var tv = v.split(':'); (tch[k] || (tch[k] = [])).push({ c: +tv[0] || 0, total: +tv[1] || 0, j: j }); }
    else if (role === 'C') { var cv = v.split(':'); (cch[k] || (cch[k] = [])).push({ c: +cv[0] || 0, w: +cv[1] || 1, multi: cv[2] === '1', n: n, j: j }); }
  }
  if (!meta || !meta.m) { M.err = 'nometa'; return M; }
  M.m = meta.m; M.a = meta.a || {}; M.dates = meta.dates || [];
  M.cf = M.m.cf || (M.mode === 'kp' ? '_kf' : '_f');
  M.ok = String(M.m.ok) === '1' || String(M.m.ok) === 'true';
  var a = M.a;
  M.applied = { per: M.m.per === 'date' ? 'date' : 'last', dt: M.m.dt || '', emp: M.m.emp || CFG.emp[0].v, tcr: M.m.tcr || '',
    flt: splitEq(a.flt), mu: (a.mu || []).slice(), lu: (a.lu || []).slice(), kp: (a.kp || []).slice(), id: splitEq(a.id, ID_KEYS) };
  if (!M.ok) return M;
  for (var tk in tch) if (tch.hasOwnProperty(tk)) M.trees[tk] = buildTree(tk, tch[tk]);
  // Куб: число сотрудников — по пачкам кода численности (он у каждого сотрудника).
  var A = alphaMap(M.m.alph || '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_');
  var ec = cch.emp || [];
  for (var e = 0; e < ec.length; e++) M.N += ec[e].n;
  var N = M.N;
  for (var ck in cch) {
    if (!cch.hasOwnProperty(ck)) continue;
    var list = cch[ck].sort(function (x, y) { return x.c - y.c; });
    var T = M.trees[ck];
    if (list.length && list[0].multi) {
      M.multi[ck] = decodeMulti(list, N, A, T ? function (vv) { return T.leaf[vv]; } : null);
      continue;
    }
    var codes = new Int32Array(N), at = 0;
    for (var q = 0; q < list.length; q++) at += decodeFixed(list[q].j, list[q].w, A, codes, at);
    // У структур код — номер листа: переводим в номер узла (−1 — пути нет).
    if (T) for (var x = 0; x < N; x++) codes[x] = codes[x] ? T.leaf[codes[x]] : -1;
    M.cube[ck] = codes;
  }
  // Численность и тип ЮЛ: код словаря → биты.
  M.bits = {};
  var bk = ['emp', 'tcr'];
  for (var b = 0; b < bk.length; b++) {
    var dv = M.dict[bk[b]] || [], bits = new Int32Array(dv.length);
    for (var y = 0; y < dv.length; y++) bits[y] = +dv[y] || 0;
    M.bits[bk[b]] = bits;
  }
  return M;
}
var MODEL = buildModel();
var MODE = MODEL.mode;

// ---- применённое, набранное ----
function copyF(o) {
  var c = { per: o.per, dt: o.dt, emp: o.emp, tcr: o.tcr, flt: {}, mu: (o.mu || []).slice(), lu: (o.lu || []).slice(),
    kp: (o.kp || []).slice(), id: {} };
  for (var a in (o.flt || {})) if (o.flt.hasOwnProperty(a) && o.flt[a].length) c.flt[a] = o.flt[a].slice();
  for (var i = 0; i < ID_KEYS.length; i++) c.id[ID_KEYS[i]] = ((o.id || {})[ID_KEYS[i]] || []).slice();
  return c;
}
var DEFAULT_F = { per: 'last', dt: '', emp: CFG.emp[0].v, tcr: '', flt: {}, mu: [], lu: [], kp: [], id: {} };
function applied() { return state.applied || MODEL.applied || DEFAULT_F; }
function staged() { return state.stage || applied(); }
function idChanged(a, b) {
  for (var i = 0; i < ID_KEYS.length; i++) if (!sameSet((a.id || {})[ID_KEYS[i]], (b.id || {})[ID_KEYS[i]])) return true;
  return false;
}
function perChanged(a, b) { return (a.per || 'last') !== (b.per || 'last') || (a.per === 'date' && a.dt !== b.dt); }
function diffKeys(a, b) {
  var out = [];
  if (perChanged(a, b)) out.push('per');
  if ((a.emp || CFG.emp[0].v) !== (b.emp || CFG.emp[0].v)) out.push('emp');
  if ((a.tcr || '') !== (b.tcr || '')) out.push('tcr');
  for (var t = 0; t < CFG.trees.length; t++) { var tk = CFG.trees[t].key; if (!sameSet(a[tk], b[tk])) out.push(tk); }
  if (idChanged(a, b)) out.push('ids');
  var seen = {};
  for (var x in (a.flt || {})) if (a.flt.hasOwnProperty(x)) seen[x] = 1;
  for (var y in (b.flt || {})) if (b.flt.hasOwnProperty(y)) seen[y] = 1;
  for (var z in seen) if (seen.hasOwnProperty(z) && !sameSet((a.flt || {})[z], (b.flt || {})[z])) out.push('f:' + z);
  return out;
}
function stageEdit(fn) {
  if (!state.stage) state.stage = copyF(applied());
  fn(state.stage);
  if (!diffKeys(applied(), state.stage).length) state.stage = null;
}
function stageDiff() { return state.stage ? diffKeys(applied(), state.stage).length : 0; }
function idCount(o) {
  var n = 0;
  for (var i = 0; i < ID_KEYS.length; i++) n += ((o.id || {})[ID_KEYS[i]] || []).length;
  return n;
}
// Ключ фильтра: per, ids, emp, tcr, mu, lu, kp или f:<атрибут>.
function fieldKey(k) { return k === 'per' || k === 'ids' || k === 'emp' || k === 'tcr' || isTreeKey(k) ? k : 'f:' + k; }
function attrOf(key) { return String(key).indexOf('f:') === 0 ? key.slice(2) : ''; }
function isSet(o, key) {
  if (key === 'per') return o.per === 'date';
  if (key === 'emp') return (o.emp || CFG.emp[0].v) !== CFG.emp[0].v;
  if (key === 'tcr') return !!o.tcr;
  if (key === 'ids') return idCount(o) > 0;
  if (isTreeKey(key)) return (o[key] || []).length > 0;
  return ((o.flt || {})[attrOf(key)] || []).length > 0;
}
function anyFilter(o) {
  for (var g = 0; g < CFG.shelf.length; g++) for (var i = 0; i < CFG.shelf[g].keys.length; i++) if (isSet(o, fieldKey(CFG.shelf[g].keys[i]))) return true;
  return false;
}
function setCount(o, keys) {
  var n = 0;
  for (var i = 0; i < keys.length; i++) if (isSet(o, fieldKey(keys[i]))) n++;
  return n;
}
// Маска кросс-фильтра: носитель = основа + meta.cf; value = [] не шлём никогда. frq — метка запроса:
// вернётся в эхе и панели, и списка.
function maskOf(o) {
  var out = [], cf = MODEL.cf;
  function add(base, vals) {
    var v = [];
    for (var i = 0; i < (vals || []).length; i++) if (vals[i] !== null && vals[i] !== undefined && String(vals[i]) !== '') v.push(String(vals[i]));
    if (v.length) out.push({ column: base + cf, operator: 'IN', value: v });
  }
  if (o.per === 'date' && o.dt) { add('per', ['date']); add('dt', [o.dt]); }
  if (o.emp && o.emp !== CFG.emp[0].v) add('emp', [o.emp]);
  if (o.tcr) add('tcr', [o.tcr]);
  var fl = [];
  for (var a in (o.flt || {})) if (o.flt.hasOwnProperty(a)) for (var i = 0; i < o.flt[a].length; i++) fl.push(a + '=' + o.flt[a][i]);
  add('flt', fl);
  add('mu', o.mu); add('lu', o.lu); add('kp', o.kp);
  var ids = [];
  for (var k = 0; k < ID_KEYS.length; k++) {
    var list = (o.id || {})[ID_KEYS[k]] || [];
    for (var j = 0; j < list.length; j++) ids.push(ID_KEYS[k] + '=' + list[j]);
  }
  add('id', ids);
  add('frq', [o.frq]);
  return out;
}

// ---- куб: фильтры набранного выбора и счётчики «при остальных» — в браузере, без запроса ----
// Проход 1 (pass): у сотрудника — сколько фильтров он не прошёл (fail) и какой, если один (fidx).
// Счётчик значения фильтра X — сотрудники, прошедшие все фильтры, кроме, может быть, X. Как в датасете списка:
// атрибут — значение из выбранных; рег. HR — любой из логинов ('-' — нет логина); структура — лист внутри
// выбранного узла (у КП — хоть одна аллокация); численность и тип ЮЛ — бит. «Сотрудники по списку» уже
// применены к кубу датасетом; «Период» куб не меняет (действующие на последний день).
function cubeSig(o) {
  var parts = [o.emp || '', o.tcr || '', (o.mu || []).join(','), (o.lu || []).join(','), (o.kp || []).join('\u0002')];
  var ks = [];
  for (var a in (o.flt || {})) if (o.flt.hasOwnProperty(a) && o.flt[a].length) ks.push(a + '=' + o.flt[a].slice().sort().join('\u0002'));
  return parts.concat(ks.sort()).join('\u0001');
}
function coverOf(tk, sel) {
  var T = MODEL.trees[tk];
  if (!T || !sel.length) return null;
  var cov = new Uint8Array(T.nodes.length), any = false;
  for (var i = 0; i < sel.length; i++) {
    var ix = T.by[sel[i]];
    if (ix === undefined) continue;
    any = true;
    for (var j = ix; j <= T.nodes[ix].end; j++) cov[j] = 1;
  }
  return any ? cov : new Uint8Array(T.nodes.length);
}
function activeFilters(o) {
  var out = [];
  var eb = 0;
  for (var e = 0; e < CFG.emp.length; e++) if (CFG.emp[e].v === (o.emp || CFG.emp[0].v)) eb = CFG.emp[e].bit;
  if (MODEL.cube.emp) out.push({ key: 'emp', kind: 'bit', codes: MODEL.cube.emp, bits: MODEL.bits.emp, bit: eb || 1 });
  if (o.tcr && MODEL.cube.tcr) {
    var tb = 0;
    for (var t = 0; t < CFG.tcr.length; t++) if (CFG.tcr[t].v === o.tcr) tb = CFG.tcr[t].bit;
    out.push({ key: 'tcr', kind: 'bit', codes: MODEL.cube.tcr, bits: MODEL.bits.tcr, bit: tb });
  }
  for (var a in (o.flt || {})) {
    if (!o.flt.hasOwnProperty(a) || !o.flt[a].length) continue;
    var dict = MODEL.dict[a] || [], sel = new Uint8Array(dict.length + 1), cm = MODEL.code[a] || {};
    for (var i = 0; i < o.flt[a].length; i++) { var c = cm['~' + o.flt[a][i]]; if (c !== undefined) sel[c] = 1; }
    if (MODEL.multi[a]) out.push({ key: 'f:' + a, kind: 'multi', m: MODEL.multi[a], sel: sel });
    else if (MODEL.cube[a]) out.push({ key: 'f:' + a, kind: 'one', codes: MODEL.cube[a], sel: sel });
  }
  for (var k = 0; k < CFG.trees.length; k++) {
    var tk = CFG.trees[k].key, cov = coverOf(tk, o[tk] || []);
    if (!cov) continue;
    if (MODEL.multi[tk]) out.push({ key: tk, kind: 'tmulti', m: MODEL.multi[tk], cov: cov });
    else if (MODEL.cube[tk]) out.push({ key: tk, kind: 'tree', codes: MODEL.cube[tk], cov: cov });
  }
  return out;
}
function passOne(f, e) {
  if (f.kind === 'one') return f.sel[f.codes[e]] === 1;
  if (f.kind === 'bit') return (f.bits[f.codes[e]] & f.bit) !== 0;
  if (f.kind === 'tree') { var x = f.codes[e]; return x >= 0 && f.cov[x] === 1; }
  var m = f.m, v = f.kind === 'multi' ? f.sel : f.cov;
  for (var i = m.off[e]; i < m.off[e + 1]; i++) if (v[m.vals[i]] === 1) return true;
  return false;
}
var CUBE = { sig: null, pass: null, counts: {} };
function cubePass() {
  var o = staged(), sig = cubeSig(o);
  if (CUBE.sig === sig && CUBE.pass) return CUBE.pass;
  var N = MODEL.N, fl = activeFilters(o), fail = new Uint8Array(N), fidx = new Uint8Array(N), total = 0;
  for (var e = 0; e < N; e++) {
    var nf = 0, last = 0;
    for (var i = 0; i < fl.length && nf < 2; i++) if (!passOne(fl[i], e)) { nf++; last = i; }
    fail[e] = nf; fidx[e] = last;
    if (!nf) total++;
  }
  var at = {};
  for (var j = 0; j < fl.length; j++) at[fl[j].key] = j;
  CUBE = { sig: sig, pass: { fail: fail, fidx: fidx, total: total, at: at, n: fl.length }, counts: {} };
  return CUBE.pass;
}
function cubeTotal() { return MODEL.N ? cubePass().total : 0; }
// Счётчики ключа фильтра: атрибут — по кодам словаря; структура — по узлам (поддерево); численность и тип ЮЛ —
// по вариантам. Запоминаются до следующей правки выбора.
function cubeCounts(key) {
  var p = cubePass();
  if (CUBE.counts[key]) return CUBE.counts[key];
  var N = MODEL.N, fi = p.at.hasOwnProperty(key) ? p.at[key] : -1, fail = p.fail, fidx = p.fidx, out, e, i;
  var ok = function (x) { return fail[x] === 0 || (fail[x] === 1 && fidx[x] === fi); };
  var a = attrOf(key);
  if (key === 'emp' || key === 'tcr') {
    var opts = key === 'emp' ? CFG.emp : CFG.tcr, codes = MODEL.cube[key], bits = MODEL.bits[key];
    out = new Uint32Array(opts.length);
    if (codes) for (e = 0; e < N; e++) if (ok(e)) for (i = 0; i < opts.length; i++) if (bits[codes[e]] & opts[i].bit) out[i]++;
  } else if (isTreeKey(key)) {
    var T = MODEL.trees[key];
    out = new Uint32Array(T ? T.nodes.length : 0);
    if (T && MODEL.cube[key]) {
      var cd = MODEL.cube[key];
      for (e = 0; e < N; e++) if (cd[e] >= 0 && ok(e)) out[cd[e]]++;
      for (i = T.nodes.length - 1; i >= 0; i--) if (T.nodes[i].par >= 0) out[T.nodes[i].par] += out[i];
    } else if (T && MODEL.multi[key]) {
      // У КП у сотрудника несколько листов: в каждом узле он считается один раз (метка сотрудника).
      var m = MODEL.multi[key], stamp = new Int32Array(T.nodes.length);
      for (e = 0; e < N; e++) {
        if (!ok(e)) continue;
        for (var q = m.off[e]; q < m.off[e + 1]; q++) {
          var x = m.vals[q];
          while (x >= 0 && stamp[x] !== e + 1) { stamp[x] = e + 1; out[x]++; x = T.nodes[x].par; }
        }
      }
    }
  } else if (a) {
    out = new Uint32Array((MODEL.dict[a] || []).length);
    if (MODEL.cube[a]) { var c1 = MODEL.cube[a]; for (e = 0; e < N; e++) if (ok(e)) out[c1[e]]++; }
    else if (MODEL.multi[a]) {
      var mm = MODEL.multi[a];
      for (e = 0; e < N; e++) if (ok(e)) for (var r = mm.off[e]; r < mm.off[e + 1]; r++) out[mm.vals[r]]++;
    }
  } else out = new Uint32Array(0);
  CUBE.counts[key] = out;
  return out;
}
// Значения атрибута по убыванию счётчика; выбранные всегда в списке (и те, что пропали из словаря).
function facetVals(attr) {
  var dict = MODEL.dict[attr] || [], cnt = cubeCounts('f:' + attr), out = [], sel = staged().flt[attr] || [], seen = {};
  for (var i = 0; i < dict.length; i++) { out.push({ v: dict[i], n: cnt[i] || 0 }); seen['~' + dict[i]] = 1; }
  for (var j = 0; j < sel.length; j++) if (!seen['~' + sel[j]]) out.push({ v: sel[j], n: 0 });
  out.sort(function (a, b) { return b.n - a.n || (a.v < b.v ? -1 : (a.v > b.v ? 1 : 0)); });
  return out;
}
function nodeOf(tk, v) { var T = MODEL.trees[tk]; return T && T.by.hasOwnProperty(v) ? T.nodes[T.by[v]] : null; }
function nodeName(tk, v) {
  if (tk === 'kp') { var ps = String(v).split('\x1f'); return ps[ps.length - 1]; }
  var x = nodeOf(tk, v);
  return x ? x.name : v;
}
function pathOf(tk, x) {
  var T = MODEL.trees[tk], chain = [], p = x.par, guard = 0;
  while (p >= 0 && guard++ < 16) { chain.unshift(T.nodes[p].name); p = T.nodes[p].par; }
  return chain.join(' › ');
}
function nodePath(tk, v) {
  if (tk === 'kp') return String(v).split('\x1f').join(' › ');
  var x = nodeOf(tk, v);
  if (!x) return v;
  var p = pathOf(tk, x);
  return p ? p + ' › ' + x.name : x.name;
}

// ---------- БЛОК 4: ФОРМАТИРОВАНИЕ И ЦВЕТ ----------
var THIN = ' ', NBSP = ' ';
var MONTH_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
function fmtInt(v) {
  var n = num(v);
  if (n === null) return '—';
  var s = String(Math.round(Math.abs(n))), out = '';
  while (s.length > 3) { out = THIN + s.slice(-3) + out; s = s.slice(0, -3); }
  return (n < 0 ? '−' : '') + s + out;
}
function plural(n, one, few, many) {
  var a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b === 1) return one;
  if (b > 1 && b < 5) return few;
  return many;
}
function fmtDate(v) {
  var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v || ''));
  return m ? m[3] + '.' + m[2] + '.' + m[1] : String(v == null ? '' : v);
}
function fmtDay(iso) {
  var p = toDate(iso);
  return p ? p.d + NBSP + MONTH_GEN[p.m] + ' ' + p.y : '';
}
// Значение фильтра словами: флаги — Да / Нет, пустое — «(пусто)», у рег. HR '-' — нет логина.
function valLabel(attr, v) {
  if (inArr(CFG.flagFacets, attr)) { if (v === '1') return 'Да'; if (v === '0') return 'Нет'; }
  if (attr === 'regional_hr_login' && v === '-') return '(не указан)';
  return v === '' ? '(пусто)' : v;
}
function tipHtml(o) {
  var P = CFG.ns;
  return (o.title ? '<span class="' + P + '-t-h">' + esc(o.title) + '</span>' : '')
    + (o.text ? '<span class="' + P + '-t-x">' + esc(o.text) + '</span>' : '')
    + (o.note ? '<span class="' + P + '-t-n">' + esc(o.note) + '</span>' : '');
}
function tip(o) { return ' data-tip="' + esc(tipHtml(o)) + '"'; }
function hl(text, q) {
  var s = String(text == null ? '' : text);
  if (!q) return esc(s);
  var at = lower(s).indexOf(q);
  if (at < 0) return esc(s);
  return esc(s.slice(0, at)) + '<mark class="' + CFG.ns + '-hl">' + esc(s.slice(at, at + q.length)) + '</mark>' + hl(s.slice(at + q.length), q);
}
function cssColor(c) {
  if (!c) return '#000';
  if (typeof c === 'string') return c;
  var a = (c.length >= 4) ? c[3] : 1;
  return 'rgba(' + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]) + ',' + a + ')';
}

// ---------- БЛОК 5: РАЗМЕТКА (<style> + HTML) ----------
// КАЖДЫЙ селектор начинается с .<ns>- — иначе стили протекут в интерфейс Proteus.
// Панель — во всю высоту ячейки; ширина закреплена, пока iframe развёрнут (выпадашка открыта).
function buildCSS() {
  var P = '.' + CFG.ns, C = CFG.colors, F = CFG.fonts, S = CFG.spacing;
  var SHL = '0 10px 30px rgba(20,28,45,.18),0 2px 6px rgba(20,28,45,.08)';
  return [
    '<style>',
    P + '-root{width:100%;height:100%;box-sizing:border-box;font-family:' + F.family + ';font-size:' + F.body + 'px;color:' + C.ink + ';}',
    P + '-root *,' + P + '-dd *{box-sizing:border-box;font-family:inherit;}',
    // панель: шапка, разделы (прокрутка), подвал с «Применить» — всегда на виду
    P + '-panel{display:flex;flex-direction:column;height:100%;background:' + C.card + ';border-radius:12px;box-shadow:0 1px 3px rgba(20,28,45,.06),0 4px 16px rgba(20,28,45,.04);overflow:hidden;}',
    P + '-ph{flex:0 0 auto;display:flex;align-items:center;gap:8px;padding:12px ' + S.pad + 'px 8px;}',
    P + '-pt{font-size:' + F.title + 'px;font-weight:600;color:' + C.ink + ';flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
    P + '-body{flex:1 1 auto;min-height:0;overflow:auto;padding:0 ' + S.pad + 'px 8px;}',
    P + '-sec{border-top:1px solid ' + C.line2 + ';padding:6px 0 8px;}',
    P + '-sec:first-child{border-top:0;}',
    P + '-sh{display:flex;align-items:center;gap:6px;width:100%;border:0;background:transparent;padding:4px 0 6px;cursor:pointer;text-align:left;font-size:' + F.cap + 'px;font-weight:500;text-transform:uppercase;letter-spacing:.4px;color:' + C.muted + ';}',
    P + '-sh:hover{color:' + C.ink2 + ';}',
    P + '-shc{display:inline-block;width:10px;font-size:9px;}',
    P + '-shn{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
    P + '-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:' + S.gap + 'px;}',
    // поле фильтра: подпись сверху, выбор снизу; заданный — синий, набранный — пунктир акцентом
    P + '-fld{position:relative;display:flex;flex-direction:column;justify-content:center;gap:1px;min-width:0;height:' + S.fieldH + 'px;border:1px solid ' + C.line + ';background:' + C.card + ';border-radius:8px;padding:0 22px 0 9px;cursor:pointer;text-align:left;}',
    P + '-fld:hover{border-color:#cfd5df;}',
    P + '-fld' + P + '-set{background:' + C.blueBg + ';border-color:#dbe6fd;}',
    P + '-fld' + P + '-chg{border-style:dashed;border-color:' + C.act + ';}',
    P + '-fld' + P + '-on{border-color:' + C.act + ';box-shadow:0 0 0 2px rgba(43,108,255,.12);}',
    P + '-fl{font-size:' + F.cap + 'px;color:' + C.muted + ';white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:13px;}',
    P + '-fv{font-size:' + F.control + 'px;font-weight:500;color:' + C.ink2 + ';white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:16px;}',
    P + '-fld' + P + '-set ' + P + '-fl{color:#5b83dc;}',
    // структура — на всю строку, фиолетовый акцент с лёгким градиентом
    P + '-fld' + P + '-tree{grid-column:1 / -1;height:46px;background:linear-gradient(135deg,' + C.vioBg1 + ',' + C.vioBg2 + ');border-color:' + C.vioLine + ';}',
    P + '-fld' + P + '-tree:hover{border-color:' + C.vio + ';}',
    P + '-fld' + P + '-tree ' + P + '-fl{color:' + C.vio + ';font-weight:500;}',
    P + '-fld' + P + '-tree ' + P + '-fv{color:' + C.vioTx + ';font-size:' + F.body + 'px;}',
    P + '-fld' + P + '-tree' + P + '-on{border-color:' + C.vio + ';box-shadow:0 0 0 2px rgba(109,74,224,.16);}',
    P + '-fld' + P + '-tree' + P + '-chg{border-color:' + C.vio + ';}',
    P + '-fld' + P + '-tree ' + P + '-x{background:rgba(109,74,224,.16);color:' + C.vioTx + ';}',
    P + '-fld' + P + '-set ' + P + '-fv{color:' + C.blueTx + ';}',
    P + '-fv' + P + '-all{color:' + C.muted2 + ';font-weight:400;}',
    P + '-fc{position:absolute;right:7px;top:50%;transform:translateY(-50%);color:' + C.muted2 + ';font-size:9px;}',
    P + '-x{position:absolute;right:5px;top:50%;transform:translateY(-50%);display:inline-flex;align-items:center;justify-content:center;width:15px;height:15px;border-radius:50%;background:rgba(43,95,208,.14);color:' + C.blueTx + ';font-size:11px;line-height:1;cursor:pointer;}',
    P + '-x:hover{background:rgba(43,95,208,.3);}',
    P + '-cnt{display:inline-flex;align-items:center;justify-content:center;min-width:16px;height:16px;padding:0 5px;border-radius:999px;background:' + C.act + ';color:#fff;font-size:10px;font-weight:500;text-transform:none;letter-spacing:0;}',
    P + '-foot{flex:0 0 auto;border-top:1px solid ' + C.line + ';padding:10px ' + S.pad + 'px 12px;display:flex;flex-direction:column;gap:8px;background:' + C.card + ';}',
    P + '-tot{font-size:' + F.note + 'px;color:' + C.muted + ';line-height:1.35;}',
    P + '-tot b{font-size:' + F.title + 'px;font-weight:600;color:' + C.ink + ';font-variant-numeric:tabular-nums;}',
    P + '-tot i{font-style:normal;color:' + C.warnTx + ';display:block;margin-top:2px;}',
    P + '-arow{display:flex;gap:8px;justify-content:space-between;align-items:center;}',
    P + '-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:34px;border:1px solid ' + C.line + ';background:' + C.card + ';border-radius:9px;padding:0 12px;font-weight:500;color:' + C.ink2 + ';cursor:pointer;font-size:' + F.control + 'px;white-space:nowrap;}',
    P + '-btn:hover{border-color:#d8dce4;}',
    P + '-btn' + P + '-pri{background:' + C.act + ';border-color:' + C.act + ';color:#fff;}',
    P + '-btn' + P + '-pri:hover{background:#1b5cf0;}',
    P + '-btn[disabled]{opacity:.45;cursor:default;}',
    P + '-btn' + P + '-pri[disabled]:hover{background:' + C.act + ';}',
    P + '-foot ' + P + '-pri{width:100%;}',
    P + '-lnk{color:' + C.act + ';cursor:pointer;font-weight:500;border:0;background:transparent;padding:0 2px;font-size:' + F.note + 'px;}',
    P + '-lnk:hover{text-decoration:underline;}',
    P + '-lnk[disabled]{color:' + C.muted2 + ';cursor:default;text-decoration:none;}',
    P + '-warn{font-size:' + F.note + 'px;color:' + C.warnTx + ';line-height:1.35;}',
    // тултип и выпадашка — вне корня панели: шрифт повторяем явно
    P + '-tip{position:fixed;z-index:99999;pointer-events:none;opacity:0;display:none;font-family:' + F.family + ';box-sizing:border-box;'
      + 'background:' + C.card + ';border:1px solid ' + C.line + ';border-radius:9px;box-shadow:' + SHL + ';padding:7px 10px;font-size:' + F.note + 'px;'
      + 'line-height:1.4;color:' + C.ink2 + ';font-weight:400;max-width:300px;white-space:normal;word-wrap:break-word;transition:opacity .08s;}',
    P + '-tip ' + P + '-t-h{display:block;font-size:10px;font-weight:500;letter-spacing:.3px;text-transform:uppercase;color:' + C.muted + ';margin-bottom:5px;}',
    P + '-tip ' + P + '-t-x{display:block;font-size:' + F.note + 'px;color:' + C.ink2 + ';}',
    P + '-tip ' + P + '-t-n{display:block;font-size:' + F.cap + 'px;color:' + C.muted + ';margin-top:5px;}',
    P + '-dd{position:fixed;z-index:9000;display:none;box-sizing:border-box;flex-direction:column;background:' + C.card + ';border:1px solid ' + C.line + ';border-radius:10px;box-shadow:' + SHL + ';padding:10px;font-family:' + F.family + ';font-size:' + F.body + 'px;color:' + C.ink + ';outline:none;}',
    P + '-ddh{display:flex;align-items:center;gap:8px;min-height:22px;margin:2px 4px 8px;font-size:' + F.cap + 'px;text-transform:uppercase;letter-spacing:.4px;color:' + C.muted + ';font-weight:500;}',
    P + '-ddh>span:first-child{flex:1;}',
    P + '-ddx{flex:0 0 auto;display:inline-flex;align-items:center;gap:4px;height:24px;padding:0 8px;border:1px solid ' + C.line + ';border-radius:7px;background:' + C.card + ';color:' + C.ink2 + ';font-size:' + F.note + 'px;font-weight:500;text-transform:none;letter-spacing:0;cursor:pointer;}',
    P + '-ddx:hover{border-color:' + C.act + ';color:' + C.act + ';}',
    P + '-muted{color:' + C.muted + ';font-weight:400;text-transform:none;letter-spacing:0;}',
    P + '-psearch{position:relative;display:block;margin:0 0 8px;color:' + C.muted + ';flex:0 0 auto;}',
    P + '-psearch svg{position:absolute;left:11px;top:50%;transform:translateY(-50%);pointer-events:none;}',
    P + '-srch{display:block;width:100%;height:30px;border:1px solid ' + C.line + ';border-radius:999px;padding:0 12px 0 30px;font-size:13px;color:' + C.ink + ';margin:0;background:' + C.card + ';}',
    P + '-srch:focus{outline:none;border-color:' + C.act + ';}',
    P + '-list{flex:1 1 auto;min-height:60px;overflow:auto;margin:0 -4px;padding:0 4px;}',
    P + '-opt{display:flex;align-items:center;gap:8px;padding:6px 9px;border-radius:7px;cursor:pointer;font-size:' + F.control + 'px;color:' + C.ink2 + ';}',
    P + '-opt:hover{background:#f4f6f9;color:' + C.ink + ';}',
    P + '-opt input{accent-color:' + C.blue + ';flex:0 0 auto;margin:0;cursor:pointer;}',
    P + '-opt' + P + '-cur{background:' + C.blueBg + ';color:' + C.blueTx + ';font-weight:500;}',
    P + '-opt' + P + '-zero{color:' + C.muted2 + ';}',
    P + '-optn{margin-left:auto;color:' + C.muted + ';font-size:' + F.note + 'px;font-variant-numeric:tabular-nums;white-space:nowrap;padding-left:8px;}',
    P + '-optt{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
    P + '-rd{display:inline-block;flex:0 0 auto;width:14px;height:14px;border-radius:50%;border:1.5px solid ' + C.muted2 + ';}',
    P + '-opt' + P + '-cur ' + P + '-rd{border:4px solid ' + C.act + ';}',
    P + '-blk{font-size:' + F.cap + 'px;font-weight:500;color:' + C.muted + ';text-transform:uppercase;letter-spacing:.3px;margin:10px 9px 2px;}',
    P + '-nores{padding:12px 8px;color:' + C.muted + ';font-size:' + F.note + 'px;text-align:center;line-height:1.45;}',
    P + '-more{display:block;width:100%;padding:8px;border:0;background:transparent;color:' + C.act + ';font-size:' + F.note + 'px;font-weight:500;cursor:pointer;text-align:center;}',
    P + '-more:hover{text-decoration:underline;}',
    P + '-ddf{flex:0 0 auto;display:flex;gap:8px;align-items:center;margin-top:8px;padding-top:8px;border-top:1px solid ' + C.line2 + ';}',
    P + '-ddf>span{flex:1;font-size:11px;color:' + C.muted + ';line-height:1.35;}',
    P + '-ddf ' + P + '-btn{height:28px;padding:0 10px;}',
    P + '-seg{display:inline-flex;align-items:center;gap:2px;background:' + C.line2 + ';border-radius:9px;padding:2px;flex-wrap:wrap;}',
    P + '-segb{display:inline-flex;align-items:center;gap:5px;height:22px;border:0;background:transparent;padding:0 9px;border-radius:6px;font-weight:500;font-size:' + F.note + 'px;color:' + C.muted + ';cursor:pointer;text-transform:none;letter-spacing:0;}',
    P + '-segb' + P + '-on{background:' + C.card + ';color:' + C.ink + ';}',
    P + '-segb i{font-style:normal;color:' + C.act + ';}',
    P + '-tr{display:flex;align-items:center;gap:4px;padding:3px 9px 3px 0;border-radius:7px;font-size:' + F.control + 'px;color:' + C.ink2 + ';}',
    P + '-tr:hover{background:#f4f6f9;color:' + C.ink + ';}',
    P + '-tr' + P + '-zero{color:' + C.muted2 + ';}',
    P + '-tw{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border:0;background:transparent;color:' + C.muted + ';cursor:pointer;border-radius:6px;flex:0 0 auto;font-size:10px;padding:0;}',
    P + '-tw:hover{background:#eef1f5;color:' + C.ink + ';}',
    P + '-tsp{display:inline-block;width:22px;flex:0 0 auto;}',
    P + '-tl{display:flex;align-items:center;gap:8px;flex:1;min-width:0;padding:3px 0;cursor:pointer;}',
    P + '-tl input{accent-color:' + C.blue + ';flex:0 0 auto;margin:0;cursor:pointer;}',
    P + '-tn{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
    P + '-tn' + P + '-wrap{white-space:normal;}',
    P + '-tc{color:' + C.muted + ';font-size:' + F.note + 'px;font-variant-numeric:tabular-nums;white-space:nowrap;min-width:44px;text-align:right;}',
    P + '-tpath{display:block;color:' + C.muted + ';font-size:' + F.cap + 'px;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
    P + '-tin{display:inline-block;font-size:9px;font-weight:500;text-transform:uppercase;letter-spacing:.3px;padding:1px 5px;border-radius:4px;background:' + C.blueBg + ';color:' + C.blueTx + ';margin-left:6px;vertical-align:1px;white-space:nowrap;}',
    P + '-ta{display:block;width:100%;height:150px;resize:vertical;border:1px solid ' + C.line + ';border-radius:9px;padding:8px 10px;font-size:' + F.control + 'px;line-height:1.45;color:' + C.ink + ';font-family:ui-monospace,Menlo,Consolas,monospace;margin:8px 0 6px;}',
    P + '-ta:focus{outline:none;border-color:' + C.act + ';}',
    P + '-idinfo{font-size:' + F.note + 'px;color:' + C.muted + ';padding:0 2px;}',
    P + '-idinfo b{color:' + C.ink2 + ';font-weight:500;}',
    P + '-hl{background:' + C.hl + ';color:' + C.actInk + ';border-radius:3px;padding:0 1px;}',
    P + '-note{padding:14px;font-size:' + F.note + 'px;color:' + C.warnTx + ';line-height:1.45;}',
    '</style>'
  ].join('');
}

var SEARCH_SVG = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true">'
  + '<circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.5" y2="16.5"/></svg>';
var NOTE_STAGE = 'Выбрано, но ещё не применено — кнопка «Применить» внизу панели.';
function hSearch(placeholder) {
  var P = CFG.ns;
  return '<label class="' + P + '-psearch">' + SEARCH_SVG + '<input class="' + P + '-srch" type="text" autocomplete="off" data-psearch="1"'
    + ' placeholder="' + esc(placeholder) + '" value="' + esc(state.q) + '"></label>';
}
function perText(o, full) { return o.per === 'date' && o.dt ? 'на ' + fmtDate(o.dt) : 'на ' + fmtDate(MODEL.m.data_dt) + (full ? ' · последний день' : ''); }
function labelOf(key) {
  if (key === 'per') return 'Период';
  if (key === 'ids') return 'Сотрудники по списку';
  if (key === 'emp') return 'Численность';
  if (key === 'tcr') return 'Тип ЮЛ';
  if (isTreeKey(key)) return treeDef(key).label;
  return CFG.facetLabels[attrOf(key)] || attrOf(key);
}
function shortList(list) { return list.length ? list[0] + (list.length > 1 ? ' +' + (list.length - 1) : '') : ''; }
// Что показать в поле и подсказке: {value (текст выбора или ''), all (весь выбор)}.
function fieldInfo(key, st) {
  if (key === 'per') return { value: perText(st), all: perText(st, true), shown: true };
  if (key === 'emp') return { value: isSet(st, 'emp') ? String(st.emp).toLowerCase() : '', all: String(st.emp || CFG.emp[0].v).toLowerCase(), def: 'юридическая' };
  if (key === 'tcr') return { value: st.tcr || '', all: st.tcr || 'все' };
  if (key === 'ids') {
    var parts = [];
    for (var i = 0; i < CFG.idKinds.length; i++) { var c = ((st.id || {})[CFG.idKinds[i].key] || []).length; if (c) parts.push(CFG.idKinds[i].label + ' · ' + fmtInt(c)); }
    return { value: parts.join(', '), all: parts.join(', ') };
  }
  if (isTreeKey(key)) {
    var sel = st[key] || [], nm = [], pt = [];
    for (var j = 0; j < sel.length; j++) { nm.push(nodeName(key, sel[j])); if (pt.length < 10) pt.push(nodePath(key, sel[j])); }
    return { value: shortList(nm), all: pt.join('; ') + (sel.length > pt.length ? '; …' : '') };
  }
  var a = attrOf(key), vals = (st.flt || {})[a] || [], lb = [];
  for (var v = 0; v < vals.length; v++) lb.push(valLabel(a, vals[v]));
  return { value: shortList(lb), all: lb.slice(0, 30).join(', ') + (lb.length > 30 ? '…' : '') };
}
function fieldHTML(key, st, dk) {
  var P = CFG.ns, info = fieldInfo(key, st), set = isSet(st, key), chg = inArr(dk, key), on = state.open === key, tree = isTreeKey(key);
  var blue = set || info.shown;
  var tp = tip({ title: labelOf(key), text: set ? info.all : (info.shown ? info.all : tree ? 'Всё дерево: узел и всё, что ниже' : info.def ? info.def : 'Все значения'),
    note: chg ? NOTE_STAGE : (tree ? 'Дерево всех уровней и поиск по названию; выбранный юнит — вместе со всем, что ниже' : key === 'ids' ? 'Вставка списка MasterID, логинов, табельных'
      : key === 'per' ? 'Список сотрудников на дату; числа фильтров — по действующим' : 'Число у значения — сотрудники при остальных фильтрах, сразу по выбору') });
  var val = set || info.shown ? info.value : (tree ? 'Всё дерево' : info.def || 'Все');
  return '<button type="button" class="' + P + '-fld' + (tree ? ' ' + P + '-tree' : '') + (blue ? ' ' + P + '-set' : '') + (chg ? ' ' + P + '-chg' : '') + (on ? ' ' + P + '-on' : '') + '"'
    + ' data-action="open" data-pop="' + esc(key) + '" data-k="' + esc(key) + '" aria-haspopup="true" aria-expanded="' + (on ? 'true' : 'false') + '"' + tp + '>'
    + '<span class="' + P + '-fl">' + esc(labelOf(key)) + (tree ? ' · всё дерево' : '') + '</span>'
    + '<span class="' + P + '-fv' + (blue ? '' : ' ' + P + '-all') + '">' + esc(val) + '</span>'
    + (set ? '<span class="' + P + '-x" role="button" tabindex="0" aria-label="Снять фильтр" data-action="clr" data-key="' + esc(key) + '">×</span>'
      : '<span class="' + P + '-fc">▾</span>')
    + '</button>';
}
function secFolded(g) { return state.fold.hasOwnProperty(g) ? !!state.fold[g] : !!CFG.shelf[g].fold; }
function sectionHTML(g, st, dk) {
  var P = CFG.ns, sec = CFG.shelf[g], fold = secFolded(g), n = setCount(st, sec.keys), s = '';
  s += '<div class="' + P + '-sec" data-sec="' + g + '"><button type="button" class="' + P + '-sh" data-action="sec" data-key="' + g + '" aria-expanded="' + (fold ? 'false' : 'true') + '">'
    + '<span class="' + P + '-shc">' + (fold ? '▸' : '▾') + '</span><span class="' + P + '-shn">' + esc(sec.name) + '</span>'
    + (n ? '<span class="' + P + '-cnt">' + n + '</span>' : '') + '</button>';
  if (!fold) {
    s += '<div class="' + P + '-grid">';
    for (var i = 0; i < sec.keys.length; i++) s += fieldHTML(fieldKey(sec.keys[i]), st, dk);
    s += '</div>';
  }
  return s + '</div>';
}
// Подвал: сколько сотрудников под набранным выбором (из куба, сразу), «Применить», «Отменить», «Сбросить».
function footHTML() {
  var P = CFG.ns, n = stageDiff(), st = staged(), onIds = idCount(st) > 0, onDate = st.per === 'date';
  var tot = cubeTotal();
  var s = '<div class="' + P + '-tot" data-tot="1"' + tip({ title: 'Под фильтрами', text: n ? 'Сотрудников под набранным выбором — посчитано сразу, до «Применить».' : 'Сотрудников под применёнными фильтрами.' }) + '>'
    + (onDate || onIds ? 'Действующих ' : n ? 'Будет ' : 'Под фильтрами ') + '<b>' + fmtInt(tot) + '</b> ' + plural(tot, 'сотрудник', 'сотрудника', 'сотрудников')
    + (onIds ? '<i>' + esc(CFG.text.idsNote) + '</i>' : '') + (onDate ? '<i>' + esc(CFG.text.perNote) + '</i>' : '') + '</div>';
  s += '<button type="button" class="' + P + '-btn ' + P + '-pri" data-action="apply"' + (n ? '' : ' disabled')
    + tip({ title: 'Применить', text: n ? 'Изменено фильтров: ' + n + '. Список обновится одним запросом.' : 'Выберите значения — применятся все сразу.' })
    + '>Применить' + (n ? ' · ' + n : '') + '</button>';
  s += '<div class="' + P + '-arow">'
    + '<button type="button" class="' + P + '-lnk" data-action="unstage"' + (n ? '' : ' disabled') + '>Отменить</button>'
    + '<button type="button" class="' + P + '-lnk" data-action="reset"' + (anyFilter(applied()) || n ? '' : ' disabled')
    + tip({ title: 'Сбросить все', text: 'Снять все фильтры сразу, без «Применить».' }) + '>Сбросить</button></div>';
  if (state.warn) s += '<div class="' + P + '-warn">' + esc(state.warn) + '</div>';
  return s;
}
function buildHTML() {
  var P = CFG.ns;
  if (MODEL.err) {
    var msg = MODEL.err === 'empty' ? CFG.text.noData + ': проверьте, что чарт смотрит на датасет панели фильтров'
      : MODEL.err === 'columns' ? 'В данных чарта нет колонок: ' + MODEL.missing.join(', ') + ' — добавьте role, k, v, n, j в «Измерения»'
      : 'Нет служебной строки meta: увеличьте лимит строк чарта';
    return buildCSS() + '<div class="' + P + '-root"><div class="' + P + '-panel"><div class="' + P + '-note">' + esc(msg) + '</div></div></div>';
  }
  if (!MODEL.ok) return buildCSS() + '<div class="' + P + '-root"><div class="' + P + '-panel"><div class="' + P + '-note">' + esc(CFG.text.noAccess) + '</div></div></div>';
  var st = staged(), dk = diffKeys(applied(), st), s = '', all = 0;
  for (var g = 0; g < CFG.shelf.length; g++) { s += sectionHTML(g, st, dk); all += setCount(st, CFG.shelf[g].keys); }
  return buildCSS() + '<div class="' + P + '-root">'
    + '<div class="' + P + '-panel" data-panel="1"><div class="' + P + '-ph"><span class="' + P + '-pt">Фильтры</span>'
    + (all ? '<span class="' + P + '-cnt"' + tip({ title: 'Заданы', text: 'Фильтров задано: ' + all + (dk.length ? ', из них не применено: ' + dk.length : '') + '.' }) + '>' + all + '</span>' : '') + '</div>'
    + '<div class="' + P + '-body" data-body="1">' + s + '</div>'
    + '<div class="' + P + '-foot" data-foot="1">' + footHTML() + '</div></div></div>';
}

// ---- выпадашки ----
function ddWidth(key) {
  if (isTreeKey(key)) return CFG.widths.tree;
  if (key === 'ids') return CFG.widths.ids;
  if (key === 'per' || key === 'emp' || key === 'tcr') return CFG.widths.one;
  return CFG.widths.facet;
}
// Подвал выпадашки: что выбрано и прогноз, «Очистить». «Применить» — одна, внизу панели.
function ddFoot(text, clearAct, clearKey2) {
  var P = CFG.ns, tot = cubeTotal();
  return '<div class="' + P + '-ddf"><span data-pcount="1">' + esc(text) + ' · будет ' + fmtInt(tot) + '</span>'
    + (clearAct ? '<button type="button" class="' + P + '-btn" data-action="' + clearAct + '" data-key="' + esc(clearKey2 || '') + '">Очистить</button>' : '')
    + '</div>';
}
// Шапка выпадашки: название, пояснение и «Закрыть» — видно всегда, даже у большой выпадашки структуры.
function ddHead(title, muted) {
  var P = CFG.ns;
  return '<div class="' + P + '-ddh"><span>' + esc(title) + '</span>' + (muted ? '<span class="' + P + '-muted">' + muted + '</span>' : '')
    + '<button type="button" class="' + P + '-ddx" data-action="close" aria-label="Закрыть">Закрыть ✕</button></div>';
}
function perDD() {
  var P = CFG.ns, st = staged();
  return ddHead('Период', '')
    + '<div class="' + P + '-opt' + (st.per !== 'date' ? ' ' + P + '-cur' : '') + '" data-action="setper" data-key="last"><span class="' + P + '-rd"></span>'
    + '<span class="' + P + '-optt">' + esc(fmtDate(MODEL.m.data_dt)) + '</span><span class="' + P + '-optn">последний день</span></div>'
    + '<div class="' + P + '-blk">На дату</div>'
    + (MODEL.dates.length > 8 ? hSearch('Дата, например 31.08') : '')
    + '<div class="' + P + '-list" data-plist="1">' + perListHTML() + '</div>'
    + ddFoot('Числа фильтров — по действующим, от даты не зависят', '', '');
}
function perListHTML() {
  var P = CFG.ns, st = staged(), q = trim(state.q), s = '', n = 0;
  for (var i = 0; i < MODEL.dates.length; i++) {
    var d = MODEL.dates[i], t = fmtDate(d);
    if (q && t.indexOf(q) < 0 && d.indexOf(q) < 0) continue;
    n++;
    s += '<div class="' + P + '-opt' + (st.per === 'date' && st.dt === d ? ' ' + P + '-cur' : '') + '" data-action="setper" data-key="date" data-v="' + esc(d) + '">'
      + '<span class="' + P + '-rd"></span><span class="' + P + '-optt">' + esc(t) + '</span></div>';
  }
  return n ? s : '<div class="' + P + '-nores">' + (MODEL.dates.length ? 'Такой даты нет' : 'Дат нет') + '</div>';
}
// Численность и тип ЮЛ: один вариант, счётчик — при остальных фильтрах.
function choiceListHTML(key) {
  var P = CFG.ns, cur = staged()[key] || '', opts = key === 'emp' ? CFG.emp : [{ v: '', bit: 0 }].concat(CFG.tcr), cnt = cubeCounts(key), s = '';
  for (var i = 0; i < opts.length; i++) {
    var o = opts[i], on = o.v === cur || (key === 'emp' && !cur && i === 0), n = o.bit ? cnt[key === 'emp' ? i : i - 1] : null;
    s += '<div class="' + P + '-opt' + (on ? ' ' + P + '-cur' : '') + (n === 0 ? ' ' + P + '-zero' : '') + '" data-action="set1" data-key="' + key + '" data-v="' + esc(o.v) + '">'
      + '<span class="' + P + '-rd"></span><span class="' + P + '-optt">' + esc(o.v || 'Все') + '</span>'
      + '<span class="' + P + '-optn">' + (n === null ? '' : fmtInt(n)) + '</span></div>';
  }
  return s;
}
function choiceDD(key) {
  var P = CFG.ns;
  return ddHead(labelOf(key), '') + '<div class="' + P + '-list" data-plist="1">' + choiceListHTML(key) + '</div>'
    + ddFoot(key === 'emp' ? 'Юридическая — по юрлицу, активная — по активной численности' : 'Только сотрудники ТЦР выбранного типа', '', '');
}
// Атрибут: значения со счётчиками при остальных фильтрах (из куба, по набранному выбору); пустые под
// выбором спрятаны — «Показать ещё N без сотрудников».
function fltValsHTML(attr) {
  var P = CFG.ns, q = lower(trim(state.q)), sel = staged().flt[attr] || [], list = facetVals(attr), s = '', n = 0, cut = false, zero = 0;
  var showZ = !!state.zeros['f:' + attr];
  for (var i = 0; i < list.length; i++) {
    var v = list[i].v, lb = valLabel(attr, v), on = inArr(sel, v);
    if (q && lower(lb).indexOf(q) < 0 && lower(v).indexOf(q) < 0) continue;
    if (!list[i].n && !on && !showZ) { zero++; continue; }
    if (n >= CFG.listMax && !on) { cut = true; continue; }
    n++;
    s += '<label class="' + P + '-opt' + (list[i].n === 0 ? ' ' + P + '-zero' : '') + '"><input type="checkbox" data-fk="' + esc(attr) + '" data-fv="' + esc(v) + '"'
      + (on ? ' checked' : '') + '><span class="' + P + '-optt">' + hl(lb, q) + '</span>'
      + '<span class="' + P + '-optn">' + fmtInt(list[i].n) + '</span></label>';
  }
  if (!n && !zero) return '<div class="' + P + '-nores">' + (list.length ? 'Ничего не найдено' : 'Значений нет') + '</div>';
  if (!n) s += '<div class="' + P + '-nores">Под остальными фильтрами сотрудников с этими значениями нет</div>';
  if (cut) s += '<div class="' + P + '-nores">Показаны первые ' + CFG.listMax + ' — остальные найдёт поиск</div>';
  if (zero) s += '<button type="button" class="' + P + '-more" data-action="zeros" data-key="f:' + esc(attr) + '">Показать ещё ' + fmtInt(zero) + ' без сотрудников</button>';
  else if (showZ) s += '<button type="button" class="' + P + '-more" data-action="zeros" data-key="f:' + esc(attr) + '">Скрыть значения без сотрудников</button>';
  return s;
}
function fltDD(attr) {
  var P = CFG.ns, nv = (MODEL.dict[attr] || []).length, sel = staged().flt[attr] || [];
  return ddHead(CFG.facetLabels[attr] || attr, fmtInt(nv) + ' ' + plural(nv, 'значение', 'значения', 'значений'))
    + hSearch('Поиск значения')
    + '<div class="' + P + '-list" data-plist="1">' + fltValsHTML(attr) + '</div>'
    + ddFoot(sel.length ? 'Выбрано: ' + sel.length : 'Все значения', sel.length ? 'fclear' : '', attr);
}
// ---- структуры: дерево всех уровней, поиск по названию; пустые под выбором спрятаны ----
function selMap(tk) { var s = {}, l = staged()[tk] || []; for (var i = 0; i < l.length; i++) s[l[i]] = 1; return s; }
function underSel(tk, x, S) {
  var T = MODEL.trees[tk], p = x.par, guard = 0;
  while (p >= 0 && guard++ < 16) { if (S[T.nodes[p].id]) return true; p = T.nodes[p].par; }
  return false;
}
function selAnc(tk) {
  var T = MODEL.trees[tk], out = {}, l = staged()[tk] || [];
  for (var i = 0; i < l.length; i++) {
    var ix = T.by[l[i]], guard = 0;
    if (ix === undefined) continue;
    var p = T.nodes[ix].par;
    while (p >= 0 && guard++ < 16) { out[p] = 1; p = T.nodes[p].par; }
  }
  return out;
}
function tIsOpen(tk, x, depth, anc) {
  var k = tk + ':' + x.id;
  if (state.treeOpen.hasOwnProperty(k)) return !!state.treeOpen[k];
  return !!anc[x.ix] || (depth === 0 && MODEL.trees[tk].roots.length === 1);
}
function treeRowHTML(tk, x, n, depth, on, inSel, open, canOpen, q, path) {
  var P = CFG.ns;
  return '<div class="' + P + '-tr' + (n ? '' : ' ' + P + '-zero') + '" style="padding-left:' + (depth * 16) + 'px">'
    + (canOpen ? '<button type="button" class="' + P + '-tw" data-action="tw" data-key="' + tk + '" data-ti="' + x.ix + '" aria-expanded="' + (open ? 'true' : 'false') + '">'
      + (open ? '▾' : '▸') + '</button>' : '<span class="' + P + '-tsp"></span>')
    + '<label class="' + P + '-tl"><input type="checkbox" data-tsel="' + tk + '" data-ti="' + x.ix + '"'
    + (on || inSel ? ' checked' : '') + (inSel ? ' disabled' : '') + '>'
    + '<span class="' + P + '-tn' + (path !== null ? ' ' + P + '-wrap' : '') + '">' + hl(x.name, q) + (inSel ? '<span class="' + P + '-tin">в выбранном</span>' : '')
    + (path ? '<span class="' + P + '-tpath">' + esc(path) + '</span>' : '') + '</span>'
    + '<span class="' + P + '-tc">' + fmtInt(n) + '</span></label></div>';
}
function treeRows(tk, ix, depth, S, anc, cnt, out) {
  if (out.n >= CFG.treeRowsMax) { out.cut = true; return; }
  var T = MODEL.trees[tk], x = T.nodes[ix], on = !!S[x.id], inSel = out.inSel || underSel(tk, x, S);
  if (!cnt[ix] && !on && !anc[ix] && !out.zeros) { out.hidden++; return; }
  out.n++;
  var kids = x.kids, canOpen = kids.length > 0, open = canOpen && tIsOpen(tk, x, depth, anc);
  out.s += treeRowHTML(tk, x, cnt[ix], depth, on, inSel && !on, open, canOpen, '', null);
  if (!open) return;
  var was = out.inSel;
  out.inSel = inSel || on;
  for (var i = 0; i < kids.length; i++) treeRows(tk, kids[i], depth + 1, S, anc, cnt, out);
  out.inSel = was;
}
function treeListHTML(tk) {
  var P = CFG.ns, T = MODEL.trees[tk], q = lower(trim(state.q)), S = selMap(tk), zeros = !!state.zeros[tk];
  if (!T) return '<div class="' + P + '-nores">Структура не пришла в ответе</div>';
  var cnt = cubeCounts(tk), s = '';
  if (q && q.length >= CFG.searchMin) {
    var hits = [], hid = 0;
    for (var i = 0; i < T.nodes.length; i++) {
      var x = T.nodes[i], at = lower(x.name).indexOf(q);
      if (at < 0) continue;
      if (!cnt[i] && !S[x.id] && !zeros) { hid++; continue; }
      hits.push({ x: x, r: (at === 0 ? 0 : 1) * 1e9 - cnt[i] });
    }
    hits.sort(function (a, b) { return a.r - b.r; });
    for (var h = 0; h < hits.length && h < 150; h++) {
      var y = hits[h].x;
      s += treeRowHTML(tk, y, cnt[y.ix], 0, !!S[y.id], !S[y.id] && underSel(tk, y, S), false, false, q, pathOf(tk, y));
    }
    if (!hits.length) s += '<div class="' + P + '-nores">Ничего не найдено</div>';
    if (hits.length > 150) s += '<div class="' + P + '-nores">Показаны первые 150 из ' + fmtInt(hits.length) + ' — уточните запрос</div>';
    if (hid) s += '<button type="button" class="' + P + '-more" data-action="zeros" data-key="' + tk + '">Показать ещё ' + fmtInt(hid) + ' без сотрудников</button>';
    return s;
  }
  if (q) return '<div class="' + P + '-nores">Введите от ' + CFG.searchMin + ' букв</div>';
  if (!T.roots.length) return '<div class="' + P + '-nores">Юнитов нет</div>';
  var anc = selAnc(tk), out = { s: '', n: 0, cut: false, inSel: false, hidden: 0, zeros: zeros };
  for (var r = 0; r < T.roots.length; r++) treeRows(tk, T.roots[r], 0, S, anc, cnt, out);
  if (!out.n) out.s += '<div class="' + P + '-nores">Под остальными фильтрами сотрудников в структуре нет</div>';
  if (out.cut) out.s += '<div class="' + P + '-nores">Показаны первые ' + CFG.treeRowsMax + ' строк — найдите юнит поиском</div>';
  if (out.hidden) out.s += '<button type="button" class="' + P + '-more" data-action="zeros" data-key="' + tk + '">Показать юниты без сотрудников</button>';
  else if (zeros) out.s += '<button type="button" class="' + P + '-more" data-action="zeros" data-key="' + tk + '">Скрыть юниты без сотрудников</button>';
  return out.s;
}
function treeDD(tk) {
  var P = CFG.ns, T = MODEL.trees[tk], n = (staged()[tk] || []).length, d = treeDef(tk), nn = T ? T.nodes.length : 0;
  return ddHead(d.name + ' · всё дерево', T ? fmtInt(nn) + ' ' + plural(nn, 'юнит', 'юнита', 'юнитов') : '')
    + hSearch('Поиск юнита по названию на любом уровне')
    + '<div class="' + P + '-list" data-plist="1">' + treeListHTML(tk) + '</div>'
    + ddFoot(n ? 'Выбрано: ' + n + ' из ' + d.max : 'Вся структура', n ? 'tclear' : '', tk);
}
// ---- сотрудники по списку ----
function idKind() { return inArr(ID_KEYS, state.idKind) ? state.idKind : 'rk'; }
function parseIds(kind, text) {
  var parts = String(text || '').split(/[\s,;]+/), out = [], bad = 0, seen = {};
  for (var i = 0; i < parts.length; i++) {
    var x = trim(parts[i]);
    if (!x) continue;
    if (kind === 'login') x = x.toLowerCase();
    if (kind === 'rk' && !/^\d+$/.test(x)) { bad++; continue; }
    if (!seen['~' + x]) { seen['~' + x] = 1; out.push(x); }
  }
  return { list: out, bad: bad };
}
function idInfoHTML() {
  var st = staged(), kind = idKind(), n = (st.id[kind] || []).length, all = idCount(st), d = CFG.idKinds[ID_KEYS.indexOf(kind)];
  return 'В списке: <b>' + fmtInt(n) + '</b>' + (state.idBad ? ' · не распознано: ' + state.idBad + ' (' + esc(d.hint) + ')' : ' · ' + esc(d.hint))
    + (all > CFG.maxIds ? ' · <b>всего больше ' + fmtInt(CFG.maxIds) + ' — лишние отброшены</b>' : '');
}
function idsDD() {
  var P = CFG.ns, st = staged(), kind = idKind(), s = '<div class="' + P + '-ddh"><span>Сотрудники по списку</span><span class="' + P + '-seg">';
  var close = '<button type="button" class="' + P + '-ddx" data-action="close" aria-label="Закрыть">Закрыть ✕</button>';
  for (var i = 0; i < CFG.idKinds.length; i++) {
    var d = CFG.idKinds[i], n = (st.id[d.key] || []).length;
    s += '<button type="button" class="' + P + '-segb' + (d.key === kind ? ' ' + P + '-on' : '') + '" data-action="idk" data-key="' + d.key + '" role="tab" aria-selected="' + (d.key === kind ? 'true' : 'false') + '">'
      + esc(d.label) + (n ? '<i>' + n + '</i>' : '') + '</button>';
  }
  s += '</span>' + close + '</div><textarea class="' + P + '-ta" data-ids="' + kind + '" spellcheck="false" placeholder="Вставьте ' + esc(CFG.idKinds[ID_KEYS.indexOf(kind)].label)
    + ' — по одному в строке, через запятую или пробел">' + esc((st.id[kind] || []).join('\n')) + '</textarea>'
    + '<div class="' + P + '-idinfo" data-idinfo="1">' + idInfoHTML() + '</div>';
  return s + ddFoot('Список применится в самом списке, числа панели — без него', 'idclear', kind);
}
function ddHTML() {
  var o = state.open;
  if (o === 'per') return perDD();
  if (o === 'emp' || o === 'tcr') return choiceDD(o);
  if (o === 'ids') return idsDD();
  if (isTreeKey(o)) return treeDD(o);
  if (attrOf(o)) return fltDD(attrOf(o));
  return '';
}
function listHTML() {
  var o = state.open;
  if (o === 'per') return perListHTML();
  if (o === 'emp' || o === 'tcr') return choiceListHTML(o);
  if (isTreeKey(o)) return treeListHTML(o);
  if (attrOf(o)) return fltValsHTML(attrOf(o));
  return null;
}

// ---------- БЛОК 6: МОНТАЖ + ИНТЕРАКТИВ ----------
// Рассылка всем iframe борда (обход от window.top; свой пропускаем): чарт списка той же вкладки узнаёт,
// что фильтры ушли, и показывает «Обновляю…» до ответа с той же меткой frq.
function bcast(msg) {
  try {
    (function walk(w, d) {
      if (d > 5) return;
      for (var i = 0; i < w.frames.length; i++) {
        var f = w.frames[i];
        if (f !== window) { try { f.postMessage(msg, '*'); } catch (e) { /* чужой фрейм */ } }
        try { walk(f, d + 1); } catch (e2) { /* нет доступа к вложенным */ }
      }
    })(window.top, 0);
  } catch (e) { /* нет window.top — стенд без родителя */ }
}

(function mount() {
  try {
    var hosts = document.querySelectorAll('[_echarts_instance_]');
    if (!hosts || hosts.length === 0) return;
    var host = hosts[hosts.length - 1];
    var cvs = host.querySelectorAll('canvas');
    for (var i = 0; i < cvs.length; i++) cvs[i].style.display = 'none';
    var prev = host.querySelector('.' + CFG.ns + '-overlay');
    if (prev) prev.parentNode.removeChild(prev);

    var overlay = document.createElement('div');
    overlay.className = CFG.ns + '-overlay';
    // Фон — только у панели: развёрнутый iframe (выпадашка открыта) прозрачен и не закрывает список.
    overlay.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;'
      + 'z-index:10;overflow:hidden;box-sizing:border-box;background:transparent;';
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    host.appendChild(overlay);

    // ── ТУЛТИП ── создаётся один раз и живёт в body (innerHTML overlay его не убивает).
    var tipEl = null;
    function getTip() {
      if (tipEl && tipEl.parentNode) return tipEl;
      var old = document.querySelector('body > .' + CFG.ns + '-tip');
      if (old) old.parentNode.removeChild(old);
      tipEl = document.createElement('div');
      tipEl.className = CFG.ns + '-tip';
      document.body.appendChild(tipEl);
      return tipEl;
    }
    getTip();
    // showTip/hideTip — служебные: тултип спрятан ДВУМЯ свойствами (display + opacity), координаты —
    // getBoundingClientRect() как есть, клампинг по окну. Подсказка едет за курсором (rect — точка
    // курсора), в пределах панели: iframe не разворачивается.
    function showTip(html, rect) {
      var tip = getTip();
      if (tip.__h !== html) { tip.innerHTML = html; tip.__h = html; }
      tip.style.display = 'block';
      tip.style.maxWidth = Math.max(180, Math.min(300, panelW() - 12)) + 'px';
      var t = tip.getBoundingClientRect();
      var pad = 6, gap = 14, W = Math.min(window.innerWidth, panelW());
      var left = rect.left + gap, top = rect.top + gap;
      if (left + t.width > W - pad) left = rect.left - t.width - gap;
      if (top + t.height > window.innerHeight - pad) top = rect.top - t.height - gap;
      left = Math.max(pad, Math.min(left, W - t.width - pad));
      top = Math.max(pad, Math.min(top, window.innerHeight - t.height - pad));
      tip.style.left = Math.round(left) + 'px';
      tip.style.top = Math.round(top) + 'px';
      tip.style.opacity = '1';
    }
    function hideTip() {
      var tip = getTip();
      tip.style.opacity = '0';
      tip.style.display = 'none';
      tip.__h = null;
    }
    function renderTip() {
      if (!state.tip) { hideTip(); return; }
      showTip(state.tip.html, state.tip.rect);
    }

    // ── ВЫПАДАШКА ── один узел в overlay рядом с панелью, position:fixed: справа от панели, поверх
    // списка (iframe при открытии разворачивается вправо — CSS борда по маркеру). Места справа нет
    // (CSS не поставлен, узкое окно) — поверх самой панели. Разметку панели render() пишет в свой
    // контейнер — выпадашка переживает пересборку.
    var box = document.createElement('div');
    box.style.cssText = 'width:100%;height:100%;';
    overlay.appendChild(box);
    var ddEl = null;
    function getDd() {
      if (ddEl && ddEl.parentNode) return ddEl;
      ddEl = document.createElement('div');
      ddEl.className = CFG.ns + '-dd';
      ddEl.setAttribute('tabindex', '-1');
      overlay.appendChild(ddEl);
      return ddEl;
    }
    function panelW() { var p = box.querySelector('[data-panel]'); return p ? p.getBoundingClientRect().right : window.innerWidth; }

    // Сигнал родителю через канал скриншотов: PNG 1×1, после IEND — маркер, выровненный по 3-байтовой
    // группе base64 (URL валиден, маркер виден в строке как есть).
    function pngUrl(big) {
      var b = CFG.overlay.png;
      if (big) {
        var raw = atob(b);
        while (raw.length % 3) raw += '\0';
        b = btoa(raw + atob(CFG.overlay.mark));
      }
      return 'data:image/png;base64,' + b;
    }
    function signal() {
      var big = !!state.open;
      if (big === state.sig) return;
      if (big && !state.pin) state.baseW = overlay.clientWidth || state.baseW;
      state.sig = big;
      var url = pngUrl(big);
      try {
        if (window.parent && window.parent !== window) {
          window.parent.postMessage({ type: 'ECHARTS_UPDATE_DATA_URL', dataUrl: url, payload: { dataUrl: url } }, '*');
        }
      } catch (e) { /* нет родителя — выпадашка остаётся в ячейке */ }
      var tr = big ? 'transparent' : '';
      document.documentElement.style.background = tr;
      document.body.style.background = tr;
      host.style.background = tr;
      // Ширина панели закреплена, пока iframe развёрнут; отпускаем, когда окно вернулось к ширине панели
      // (родитель сжимает iframe не сразу — иначе панель на кадр растягивается).
      if (big || (state.baseW && window.innerWidth > state.baseW + 4)) {
        overlay.style.width = state.baseW ? state.baseW + 'px' : '100%';
        state.pin = !!state.baseW;
      } else { overlay.style.width = '100%'; state.pin = false; }
    }
    function unpinIfShrunk() {
      if (state.pin && !state.open && window.innerWidth <= state.baseW + 4) { overlay.style.width = '100%'; state.pin = false; }
    }

    function placeDd() {
      var dd = getDd();
      if (!state.open) { dd.style.display = 'none'; return; }
      var btn = box.querySelector('[data-pop="' + state.open + '"]'), r = btn ? btn.getBoundingClientRect() : { top: 12, bottom: 40, left: 8, right: 100 };
      var S = CFG.spacing, pr = panelW(), room = window.innerWidth - pr - S.ddGap * 2, w, left;
      dd.style.display = 'flex';
      if (room >= S.ddMin) { w = Math.min(ddWidth(state.open), room); left = pr + S.ddGap; }
      else { w = Math.min(ddWidth(state.open), window.innerWidth - 16); left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8)); }
      // Структура (всё дерево) — большая: вся ширина справа от панели и вся высота чарта.
      var big = isTreeKey(state.open) && room >= S.ddMin;
      dd.style.width = w + 'px';
      dd.style.left = Math.round(left) + 'px';
      dd.style.height = big ? (window.innerHeight - 16) + 'px' : '';
      dd.style.maxHeight = big ? '' : Math.max(200, Math.min(600, window.innerHeight - 16)) + 'px';
      var h = dd.offsetHeight, top = big ? 8 : room >= S.ddMin ? r.top - 8 : r.bottom + 6;
      top = Math.max(8, Math.min(top, window.innerHeight - h - 8));
      dd.style.top = Math.round(top) + 'px';
    }
    function renderDd() {
      var dd = getDd();
      if (!state.open) { dd.style.display = 'none'; dd.innerHTML = ''; return; }
      var ls = dd.querySelector('[data-plist]'), keep = ls && dd.__k === state.open ? ls.scrollTop : 0;
      dd.innerHTML = ddHTML();
      dd.__k = state.open;
      placeDd();
      ls = dd.querySelector('[data-plist]');
      if (ls && keep) ls.scrollTop = keep;
    }
    function focusDd() {
      var dd = getDd(), inp = dd.querySelector('[data-psearch]') || dd.querySelector('[data-ids]');
      if (inp) {
        inp.focus();
        try { inp.setSelectionRange(inp.value.length, inp.value.length); } catch (er) { /* поле без выделения */ }
      } else if (state.open) { try { dd.focus({ preventScroll: true }); } catch (er2) { dd.focus(); } }
    }
    // render ТОЛЬКО пересобирает разметку. Делегированные обработчики — один раз снаружи.
    // Прокрутку разделов храним.
    function render() {
      var b0 = box.querySelector('[data-body]'), st = b0 ? b0.scrollTop : 0;
      box.innerHTML = buildHTML();
      var b1 = box.querySelector('[data-body]');
      if (b1) b1.scrollTop = st;
      renderDd();
      renderTip();
    }
    // Набранное без пересборки выпадашки (поле поиска и каретка живут): панель, список, подвал.
    function refreshStage() {
      var b0 = box.querySelector('[data-body]'), st = b0 ? b0.scrollTop : 0;
      box.innerHTML = buildHTML();
      var b1 = box.querySelector('[data-body]');
      if (b1) b1.scrollTop = st;
      var dd = getDd();
      var ls = dd.querySelector('[data-plist]'), html = listHTML();
      if (ls && html !== null) { var top = ls.scrollTop; ls.innerHTML = html; ls.scrollTop = top; }
      var ft = dd.querySelector('.' + CFG.ns + '-ddf'), tmp = document.createElement('div');
      tmp.innerHTML = ddHTML();
      var nf = tmp.querySelector('.' + CFG.ns + '-ddf');
      if (ft && nf) ft.innerHTML = nf.innerHTML;
      var inf = dd.querySelector('[data-idinfo]');
      if (inf) inf.innerHTML = idInfoHTML();
      var seg = dd.querySelector('.' + CFG.ns + '-seg'), nseg = tmp.querySelector('.' + CFG.ns + '-seg');
      if (seg && nseg) seg.innerHTML = nseg.innerHTML;
      placeDd();
      if (state.tip && state.tip.el && !state.tip.el.parentNode) { state.tip = null; hideTip(); }
    }
    function openDd(key) {
      state.open = key || '';
      state.q = '';
      state.tip = null;
      hideTip();
      signal();
      render();
      if (key) focusDd();
    }

    function trigger(node, attr) {
      while (node && node !== overlay && node !== ddEl) {
        if (node.getAttribute && node.getAttribute(attr) !== null) return node;
        node = node.parentNode;
      }
      if (node && node.getAttribute && node.getAttribute(attr) !== null) return node;
      return null;
    }

    // ── НАВЕДЕНИЕ: подсказка едет за курсором (как в HRBP HUB и Adoption); между соседними целями не
    // гаснет, ушёл курсор в пустоту — через 110 мс. iframe не разворачивает.
    var tipHideT = null;
    function onMove(e) {
      var el = trigger(e.target, 'data-tip');
      if (el && el.getAttribute('aria-expanded') === 'true') el = null;
      if (el && ddEl && ddEl.contains(el)) el = null;
      if (!el || state.open) {
        if (state.tip && !tipHideT) tipHideT = setTimeout(function () { tipHideT = null; state.tip = null; hideTip(); }, 110);
        return;
      }
      if (tipHideT) { clearTimeout(tipHideT); tipHideT = null; }
      state.tip = { html: el.getAttribute('data-tip') || '', el: el, rect: { left: e.clientX, top: e.clientY, width: 0, height: 0 } };
      showTip(state.tip.html, state.tip.rect);
    }
    function onLeave() {
      if (tipHideT) { clearTimeout(tipHideT); tipHideT = null; }
      if (state.tip) { state.tip = null; hideTip(); }
    }

    // ── ЭМИССИЯ ── кросс-фильтр только на список вкладки: панель себя не фильтрует (куб от фильтров не
    // зависит) — применённое она держит сама. Метка frq: список показывает «Обновляю…» до ответа с ней.
    function emit(f) {
      if (typeof applyCrossFilter !== 'function') { state.warn = CFG.text.noCf; render(); return; }
      state.warn = '';
      state.rqN = (state.rqN || 0) + 1;
      var m = copyF(f);
      m.frq = 'f' + state.rqN + '.' + (Date.now() % 1000000);
      state.applied = copyF(f);
      state.lastFrq = m.frq;
      state.stage = null;
      state.open = ''; state.q = ''; state.tip = null; hideTip(); signal();
      bcast({ type: 'DL_FLT', cf: MODEL.cf, frq: m.frq });
      render();
      applyCrossFilter(maskOf(m));
    }
    function treeNode(tk, t) {
      var T = MODEL.trees[tk], ti = t.getAttribute('data-ti');
      return T && ti !== null && ti !== '' ? T.nodes[+ti] : null;
    }

    function onClick(e) {
      var a = trigger(e.target, 'data-action');
      if (!a) return;
      var act = a.getAttribute('data-action'), key = a.getAttribute('data-key') || '';
      if (act === 'open') {
        var pop = a.getAttribute('data-pop') || '';
        if (state.open === pop) { openDd(''); return; }
        openDd(pop);
        return;
      }
      if (act === 'sec') { state.fold[key] = !secFolded(+key); state.tip = null; hideTip(); render(); return; }
      if (act === 'close') { openDd(''); return; }
      if (act === 'clr') {
        stageEdit(function (st) {
          if (key === 'per') { st.per = 'last'; st.dt = ''; }
          else if (key === 'emp') st.emp = CFG.emp[0].v;
          else if (key === 'tcr') st.tcr = '';
          else if (isTreeKey(key)) st[key] = [];
          else if (key === 'ids') { for (var i2 = 0; i2 < ID_KEYS.length; i2++) st.id[ID_KEYS[i2]] = []; }
          else if (attrOf(key)) delete st.flt[attrOf(key)];
        });
        state.tip = null; hideTip();
        render();
        return;
      }
      if (act === 'setper') {
        var dv = a.getAttribute('data-v') || '';
        stageEdit(function (st) { st.per = key === 'date' && dv ? 'date' : 'last'; st.dt = key === 'date' ? dv : ''; });
        refreshStage();
        return;
      }
      if (act === 'set1') {
        var sv = a.getAttribute('data-v') || '';
        stageEdit(function (st) { st[key] = key === 'emp' ? (sv || CFG.emp[0].v) : sv; });
        refreshStage();
        return;
      }
      if (act === 'apply') {
        if (!stageDiff()) return;
        emit(staged());
        return;
      }
      if (act === 'unstage') { state.stage = null; render(); return; }
      if (act === 'reset') { state.stage = null; emit(DEFAULT_F); return; }
      if (act === 'zeros') { state.zeros[key] = !state.zeros[key]; refreshStage(); return; }
      if (act === 'tw') {
        var x = treeNode(key, a);
        if (!x) return;
        var depth = 0, p = x.par, guard = 0, T = MODEL.trees[key];
        while (p >= 0 && guard++ < 16) { depth++; p = T.nodes[p].par; }
        state.treeOpen[key + ':' + x.id] = !tIsOpen(key, x, depth, selAnc(key));
        refreshStage();
        return;
      }
      if (act === 'tclear') { stageEdit(function (st) { st[key] = []; }); refreshStage(); return; }
      if (act === 'fclear') { stageEdit(function (st) { delete st.flt[key]; }); refreshStage(); return; }
      if (act === 'idk') { state.idKind = key; state.idBad = 0; renderDd(); focusDd(); return; }
      if (act === 'idclear') { state.idBad = 0; stageEdit(function (st) { st.id[key] = []; }); renderDd(); refreshStage(); focusDd(); return; }
    }

    // Чекбоксы: change, не click (label/input дают оба события).
    function onChange(e) {
      var t = e.target;
      if (!t || !t.getAttribute) return;
      var tk = t.getAttribute('data-tsel');
      if (tk) {
        var x = treeNode(tk, t);
        if (!x) return;
        var v = x.id, max = treeDef(tk).max, full = false;
        stageEdit(function (st) {
          var list = (st[tk] || []).slice(), at = list.indexOf(v);
          if (t.checked && at < 0) { if (list.length < max) list.push(v); else full = true; }
          if (!t.checked && at > -1) list.splice(at, 1);
          st[tk] = list;
        });
        state.warn = full ? 'В «' + treeDef(tk).name + '» можно выбрать не больше ' + max + ' узлов.' : '';
        refreshStage();
        return;
      }
      var fk = t.getAttribute('data-fk');
      if (fk) {
        var fv = t.getAttribute('data-fv') || '', over = false;
        stageEdit(function (st) {
          var list = (st.flt[fk] || []).slice(), at = list.indexOf(fv), sum = 0;
          for (var a in st.flt) if (st.flt.hasOwnProperty(a)) sum += st.flt[a].length;
          if (t.checked && at < 0) { if (list.length < CFG.maxVals && sum < CFG.maxValsTotal) list.push(fv); else over = true; }
          if (!t.checked && at > -1) list.splice(at, 1);
          if (list.length) st.flt[fk] = list; else delete st.flt[fk];
        });
        state.warn = over ? 'Значений в фильтрах — не больше ' + CFG.maxVals + ' у атрибута и ' + CFG.maxValsTotal + ' всего.' : '';
        refreshStage();
      }
    }
    // Поиск в выпадашке пересобирает ТОЛЬКО список — поле ввода не трогаем (фокус и каретка на месте).
    function onInput(e) {
      var t = e.target;
      if (!t || !t.getAttribute) return;
      if (t.getAttribute('data-psearch') !== null) {
        state.q = t.value;
        var ls = getDd().querySelector('[data-plist]'), html = listHTML();
        if (ls && html !== null) { ls.innerHTML = html; ls.scrollTop = 0; }
        return;
      }
      var ik = t.getAttribute('data-ids');
      if (ik) {
        var r = parseIds(ik, t.value), used = 0;
        for (var i = 0; i < ID_KEYS.length; i++) if (ID_KEYS[i] !== ik) used += (staged().id[ID_KEYS[i]] || []).length;
        state.idBad = r.bad;
        stageEdit(function (st) { st.id[ik] = r.list.slice(0, Math.max(0, CFG.maxIds - used)); });
        refreshStage();
      }
    }
    function onKeydown(e) {
      var k = e.keyCode || e.which, t = e.target;
      if (k === 27 && state.open) { openDd(''); return; }
      if ((k === 13 || k === 32) && t && t.getAttribute && t.getAttribute('role') === 'button' && t.tagName !== 'BUTTON') {
        e.preventDefault();
        onClick({ target: t });
      }
    }

    overlay.addEventListener('mousemove', onMove);
    overlay.addEventListener('mouseleave', onLeave);
    // Клик в панели помечается так же, как клик в выпадашке: пересборка отрывает цель от DOM.
    overlay.addEventListener('click', function (e) { e.__dd = true; onClick(e); });
    overlay.addEventListener('keydown', onKeydown);
    overlay.addEventListener('change', onChange);
    overlay.addEventListener('input', onInput);
    // Прокрутка разделов уводит поле из-под подсказки — гасим её.
    overlay.addEventListener('scroll', function () { if (state.tip) { state.tip = null; hideTip(); } }, true);
    getDd();

    // Глобальные слушатели переживают перезапуск скрипта — старые снимаем явно, ссылку держим в state.
    if (state.onWinResize) window.removeEventListener('resize', state.onWinResize);
    state.onWinResize = function () { unpinIfShrunk(); placeDd(); if (state.tip) renderTip(); };
    window.addEventListener('resize', state.onWinResize);
    // Клик мимо выпадашки: внутри развёрнутого iframe — клик по прозрачной части; за пределами iframe —
    // окно теряет фокус (blur).
    if (state.onDocClick) document.removeEventListener('click', state.onDocClick);
    state.onDocClick = function (ev) {
      if (!state.open || ev.__dd || !overlay.parentNode) return;
      var n = ev.target;
      while (n && n !== document.body) {
        if (n === ddEl || n === overlay) return;
        n = n.parentNode;
      }
      openDd('');
    };
    document.addEventListener('click', state.onDocClick);
    if (state.onBlur) window.removeEventListener('blur', state.onBlur);
    state.onBlur = function () {
      setTimeout(function () { if (state.open && !document.hasFocus()) openDd(''); }, 150);
      if (state.tip) { state.tip = null; hideTip(); }
    };
    window.addEventListener('blur', state.onBlur);
    if (state.onDocKey) document.removeEventListener('keydown', state.onDocKey, true);
    state.onDocKey = function (ev) {
      if ((ev.keyCode || ev.which) === 27 && state.open && !(ddEl && ddEl.contains(ev.target))) openDd('');
    };
    document.addEventListener('keydown', state.onDocKey, true);
    state.rerender = render;

    // Применённое — эхо списка той же вкладки (после перезагрузки борда кросс-фильтры могут вернуться):
    // список рассылает DL_ECHO на каждом ответе и отвечает на DL_ASK. Эхо с чужой меткой frq (старый ответ,
    // пока «Применить» ещё в пути) не берём.
    if (state.onEcho) window.removeEventListener('message', state.onEcho);
    state.onEcho = function (ev) {
      var d = ev.data || {};
      if (d.type !== 'DL_ECHO' || d.cf !== MODEL.cf || !d.f || !overlay.parentNode) return;
      if (state.lastFrq && d.frq !== state.lastFrq) return;
      var f = copyF(d.f);
      if (state.applied && !diffKeys(state.applied, f).length) return;
      state.applied = f;
      if (state.stage && !stageDiff()) state.stage = null;
      render();
    };
    window.addEventListener('message', state.onEcho);
    bcast({ type: 'DL_ASK', cf: MODEL.cf });
    if (state.stage && !stageDiff()) state.stage = null;
    state.tip = null;

    render();
    // Перезапуск скрипта (новый ответ) при открытой выпадашке: скриншот платформы мог затереть маркер —
    // повторяем сигнал; курсор — снова в поле поиска.
    if (state.open) {
      state.sig = false;
      signal();
      setTimeout(function () { if (state.open) { state.sig = false; signal(); placeDd(); } }, 400);
      focusDd();
    } else if (state.sig) { state.sig = true; signal(); }

    // ResizeObserver только правит габариты (место выпадашки). render() не вызывать.
    if (typeof ResizeObserver !== 'undefined') {
      if (state.ro && state.ro.disconnect) state.ro.disconnect();
      var ro = new ResizeObserver(function () {
        if (!state.pin) overlay.style.width = '100%';
        overlay.style.height = '100%';
        placeDd();
      });
      ro.observe(host);
      state.ro = ro;
    }
  } catch (e) {
    var bx = null;
    var hs = document.querySelectorAll('[_echarts_instance_]');
    if (hs && hs.length) bx = hs[hs.length - 1].querySelector('.' + CFG.ns + '-overlay');
    if (!bx) bx = document.querySelector('.' + CFG.ns + '-overlay');
    if (bx) {
      bx.innerHTML = '<div style="padding:16px;font:13px -apple-system,Arial,sans-serif;color:#b00020;">'
        + 'Ошибка графика: ' + esc((e && e.message) || e) + '</div>';
    }
  }
})();

// ---------- БЛОК 7: ПУСТОЙ OPTION ----------
// ГЛОБАЛЬНО, В САМОМ КОНЦЕ, ВНЕ функций и IIFE.
option = {
  animation: false,
  xAxis: { show: false, type: 'value' },
  yAxis: { show: false, type: 'value' },
  series: [{ type: 'scatter', data: [] }]
};
