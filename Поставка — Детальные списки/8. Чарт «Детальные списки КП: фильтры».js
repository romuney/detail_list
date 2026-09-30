// ============================================================================
// detail-list-filters.chart.js — строка фильтров «Детальных списков» (над чартом списка)
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
// ЧТО ЭТО. Тонкая строка над списком: все фильтры вкладки в два компактных ряда (разделы и порядок —
//   нативных фильтров борда 7241), что не влезло — в «Ещё». Клик по фильтру — широкая выпадашка поверх
//   списка: значения и деревья УЖЕ в ответе датасета (вид filters), счётчик у значения — при остальных
//   фильтрах; открыть фильтр, искать, раскрывать дерево — без запроса. Выбор копится и уходит одной
//   «Применить»: кросс-фильтр на себя (счётчики пересчитываются) и на список вкладки (строки).
// ДАННЫЕ. Датасет «Детальные списки: фильтры» (proteus/detail-list.data.sql, VIEW = 'filters'):
//   meta, F (значения атрибута одной строкой), T (узлы деревьев пачками, в порядке обхода в глубину),
//   s / q / fq — подписи выбранных и находки поиска, если значений больше, чем пришло сразу.
// ВЫПАДАШКА ПОВЕРХ ЛИСТА — костыль борда Proteus Adoption (фильтр борда 59922, строка ЦА): чарт живёт в
//   <iframe sandbox> размером с ячейку, единственный канал к родителю — postMessage
//   ECHARTS_UPDATE_DATA_URL (канал скриншотов). Открыли выпадашку → PNG 1×1 с маркером CFG.overlay.mark
//   в base64; CSS борда (`:has(img.echarts-plugin[src*=маркер])`) разворачивает iframe вниз прозрачным
//   слоем поверх списка. Закрыли → чистый PNG. Выпадашка — в body iframe, position:fixed.
// СПИСОК УЗНАЁТ О ЗАПРОСЕ СРАЗУ: «Применить» рассылает соседним iframe DL_FLT {cf, frq}; чарт списка той
//   же вкладки (тот же cf) показывает «Обновляю…», пока в его ответе нет той же метки frq.
// ============================================================================

// ---------- БЛОК 1: CFG ----------
// Один файл на обе вкладки: у строки фильтров вкладки КП в файле поставки ns 'dlkf'.
var CFG = {
  ns: 'dlkf',
  mode: 'snapshot',
  fields: { role: 'role', k: 'k', v: 'v', n: 'n', j: 'j' },
  emp: ['Юридическая', 'Активная'],
  tcr: ['ТЦР РФ', 'ТЦР СНГ', 'ТЦР РФ + ТЦР СНГ'],
  // Пределы — как у датасета: лишнее он отбросит, чарт не даёт набрать больше.
  maxVals: 200, maxValsTotal: 500, maxIds: 2000,
  searchMin: 2,                // поиск в датасете — с 2 знаков и только если пришло не всё
  searchDelay: 450,
  listMax: 300,                // значений в списке без поиска
  treeRowsMax: 900,            // строк дерева за раз
  pendingWarnMs: 30000,
  trees: [
    { key: 'mu', label: 'Юнит УС', name: 'Управленческая структура', max: 50 },
    { key: 'lu', label: 'Юнит ЮС', name: 'Юридическая структура', max: 50 },
    { key: 'kp', label: 'Продукт КП', name: 'Каталог продуктов', max: 20 }
  ],
  // Разделы и порядок — нативных фильтров борда 7241 (к ним привыкли пользователи).
  shelf: [
    { name: 'Основные', keys: ['per', 'ids', 'emp', 'active_type_nm', 'employment_relation_type_desc', 'employee_contract_type_desc',
      'residential_state_nm', 'office_desc', 'emp_specialization_oper_code', 'emp_specialization_it_code', 'emp_stream_desc',
      'emp_specialization_desc'] },
    { name: 'Управленческая', keys: ['mu', 'management_head_flg', 'hrbp_login'] },
    { name: 'Юридическая', keys: ['lu', 'regional_hr_login', 'employee_main_contract_type_nm', 'tcr'] },
    { name: 'Атрибуты найма', keys: ['mapping_channel_name', 'respond_source_nm'] },
    { name: 'Каталог продуктов', keys: ['kp'] },
    { name: 'Региональные атрибуты', keys: ['location_type', 'macroregion_nm', 'city_nm', 'tcr_exist_flg'] },
    { name: 'Другие атрибуты', keys: ['t_education_desc', 'company_fire_flg', 'rb_flg', 'rb_migration_flg', 'legal_position_nm',
      'subordination_lvl', 'head_lvl_segment'] }
  ],
  facetLabels: {
    active_type_nm: 'Тип численности', employment_relation_type_desc: 'Тип оформления', employee_contract_type_desc: 'Тип договора',
    employee_main_contract_type_nm: 'Тип договора (штат)', legal_position_nm: 'Должность', subordination_lvl: 'Положение сотрудника в структуре',
    company_fire_flg: 'Уволен на отчётную дату', t_education_desc: 'T-образование',
    emp_specialization_oper_code: 'HQ | Line | Support', emp_specialization_it_code: 'IT | non-IT', emp_stream_desc: 'Стрим',
    emp_specialization_desc: 'Специализация', management_head_flg: 'Флаг руководителя УС', head_lvl_segment: 'Сегмент руководителя',
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
  // Ширина выпадашки по виду фильтра, px (не шире окна).
  widths: { tree: 540, facet: 400, one: 300, ids: 540, more: 360 },
  overlay: {
    // «DL-FLT-DD-ON» в base64: 12 байт = ровно 16 знаков, стоит в строке PNG как есть.
    mark: 'REwtRkxULURELU9O',
    png: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='
  },
  text: {
    noData: 'Нет данных',
    notApplied: 'Ответа нет 30 секунд. Если так на каждом «Применить» — строка фильтров не фильтрует сама себя: в JSON-метаданных дашборда у неё crossFilters.scope.excluded не должен содержать сам чарт (инструкция поставки, п. 4).',
    noAccess: 'Для вашего логина нет строки в таблице доступа warden — фильтры недоступны.',
    noCf: 'Фильтры не применились: нет applyCrossFilter (откройте чарт на дашборде).'
  },
  // Токены — профиль Proteus Adoption, как у чарта списка.
  colors: {
    bg: '#f4f5f7', card: '#ffffff', line: '#e7e9ee', line2: '#eef0f3',
    ink: '#23272e', ink2: '#454b55', muted: '#8a909c', muted2: '#aab0bb',
    warnTx: '#9a6500', blue: '#3b6fe0', blueBg: '#eef3fe', blueTx: '#2b5fd0', act: '#2b6cff', actInk: '#1f55d6', hl: '#dfe8ff'
  },
  // Кегли — роли профиля Adoption, веса 400 / 500 / 600. Строка фильтров — компактная: пилюля 30 px.
  fonts: { family: 'Inter,-apple-system,"Segoe UI",Roboto,Arial,sans-serif', micro: 9.5, cap: 10.5, note: 11.5, control: 12, body: 12.5, title: 14.5 },
  spacing: { pillH: 30, rowGap: 6, padY: 8, padX: 12 }
};

// ---------- БЛОК 2: ВХОД + СОСТОЯНИЕ + ХЕЛПЕРЫ ----------
var rawData = (typeof data !== 'undefined' && Array.isArray(data)) ? data : [];

if (!window.__pvtState) window.__pvtState = {};
var __S = window.__pvtState;
var STATE0 = {
  tip: null,
  open: '',          // открытая выпадашка: per | emp | tcr | ids | mu | lu | kp | f:<атрибут> | more | ''
  via: '',           // выпадашка открыта из «Ещё» — якорь там
  q: '', qT: null,   // строка поиска выпадашки и таймер поиска в датасете
  stage: null,       // набранное, но не применённое — копия applied() с правками
  treeOpen: {}, idKind: 'rk', idBad: 0,
  names: {},         // подписи выбранных узлов: 'mu:id' → {name, path}
  overflow: [],      // ключи фильтров, не влезших в два ряда (они в «Ещё»)
  pend: null, pendT: null, rqN: 0, warn: '',
  baseH: 0, sig: false, pin: false, tipBig: false
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
// Значение атрибута в пачке: \\ \t \n \r экранированы обратным слэшем.
function unescV(s) {
  return s.indexOf('\\') < 0 ? s : s.replace(/\\(.)/g, function (m, c) { return c === 't' ? '\t' : c === 'n' ? '\n' : c === 'r' ? '\r' : c; });
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
// Узлы дерева из пачек (порядок обхода в глубину): родитель — ближайший выше узел меньшего уровня.
// У КП id узла — его путь именами через \x1F: он же значение фильтра.
function buildTree(tk, chunks) {
  chunks.sort(function (a, b) { return a.c - b.c; });
  var nodes = [], by = {}, kids = {}, roots = [], stack = [], total = 0;
  for (var c = 0; c < chunks.length; c++) {
    total = chunks[c].total || total;
    var lines = b64utf8(chunks[c].j).split('\n');
    for (var li = 0; li < lines.length; li++) {
      if (lines[li] === '') continue;
      var p = lines[li].split('\t'), x;
      if (tk === 'kp') x = { lvl: +p[0] || 0, n: +p[1] || 0, hk: p[2] === '1', name: p[3] || '' };
      else x = { id: p[0], lvl: +p[1] || 0, n: +p[2] || 0, hk: p[3] === '1', name: p[4] || '' };
      while (stack.length && stack[stack.length - 1].lvl >= x.lvl) stack.pop();
      var par = stack.length ? stack[stack.length - 1] : null;
      x.pid = par ? par.id : '';
      if (tk === 'kp') x.id = (par ? par.id + '\x1f' : '') + x.name;
      x.ix = nodes.length;
      stack.push(x);
      nodes.push(x);
      by[x.id] = x;
      if (par) (kids[par.id] || (kids[par.id] = [])).push(x.id); else roots.push(x.id);
    }
  }
  var byName = function (a, b) { return String(by[a].name).localeCompare(String(by[b].name), 'ru'); };
  roots.sort(byName);
  for (var kk in kids) if (kids.hasOwnProperty(kk)) kids[kk].sort(byName);
  return { nodes: nodes, by: by, kids: kids, roots: roots, total: total || nodes.length, full: nodes.length >= total };
}
function buildModel() {
  var F = CFG.fields, M = { ok: false, err: '', missing: [], mode: 'us', cf: '_f', m: {}, a: {}, dates: [], total: 0,
    facets: {}, nv: {}, trees: {}, q: [], qEcho: '', fq: {}, sel: {}, applied: null };
  if (!rawData.length) { M.err = 'empty'; return M; }
  var r0 = rawData[0], need = ['role', 'k', 'v', 'n', 'j'];
  for (var i = 0; i < need.length; i++) if (!r0.hasOwnProperty(F[need[i]])) M.missing.push(F[need[i]]);
  if (M.missing.length) { M.err = 'columns'; return M; }
  var meta = null, tch = {};
  for (var r = 0; r < rawData.length; r++) {
    var row = rawData[r], role = row[F.role];
    var k = row[F.k] == null ? '' : String(row[F.k]), v = row[F.v] == null ? '' : String(row[F.v]);
    var n = num(row[F.n]) || 0, j = row[F.j] == null ? '' : String(row[F.j]);
    if (role === 'meta') { meta = parseJSON(j); M.mode = k === 'kp' ? 'kp' : 'us'; M.total = n; }
    else if (role === 'F') {
      var vals = [], lines = b64utf8(j).split('\n');
      for (var li = 0; li < lines.length; li++) {
        if (lines[li] === '') continue;
        var at = lines[li].lastIndexOf('\t');
        vals.push({ v: unescV(lines[li].slice(0, at)), n: +lines[li].slice(at + 1) || 0 });
      }
      M.facets[k] = vals;
      M.nv[k] = +v || vals.length;
    }
    else if (role === 'T') { var cv = v.split(':'); (tch[k] || (tch[k] = [])).push({ c: +cv[0] || 0, total: +cv[1] || 0, j: j }); }
    else if (role === 'fq') (M.fq[k] || (M.fq[k] = [])).push({ v: v, n: n });
    else if (role === 'q' || role === 's') {
      var p = j.split('\t');
      var node = { id: v, k: k, n: n, lvl: +p[0] || 0, pid: p[1] || '', name: p[2] || '', hk: p[4] === '1', path: p[5] || '' };
      if (k === 'kp') { node.id = node.path; node.path = node.path.split('\x1f').slice(0, -1).join(' › '); }
      if (role === 'q') M.q.push(node); else M.sel[k + ':' + node.id] = node;
    }
  }
  if (!meta || !meta.m) { M.err = 'nometa'; return M; }
  M.m = meta.m; M.a = meta.a || {}; M.dates = meta.dates || [];
  M.cf = M.m.cf || (M.mode === 'kp' ? '_kf' : '_f');
  M.ok = String(M.m.ok) === '1' || String(M.m.ok) === 'true';
  for (var tk in tch) if (tch.hasOwnProperty(tk)) M.trees[tk] = buildTree(tk, tch[tk]);
  var a = M.a;
  M.applied = { per: M.m.per === 'date' ? 'date' : 'last', dt: M.m.dt || '', emp: M.m.emp || CFG.emp[0], tcr: M.m.tcr || '',
    flt: splitEq(a.flt), mu: (a.mu || []).slice(), lu: (a.lu || []).slice(), kp: (a.kp || []).slice(), id: splitEq(a.id, ID_KEYS) };
  M.qEcho = (a.q || [])[0] || '';
  return M;
}
var MODEL = buildModel();
var MODE = MODEL.mode;

// ---- применённое, набранное, запрос ----
function copyF(o) {
  var c = { per: o.per, dt: o.dt, emp: o.emp, tcr: o.tcr, flt: {}, mu: (o.mu || []).slice(), lu: (o.lu || []).slice(),
    kp: (o.kp || []).slice(), id: {} };
  for (var a in (o.flt || {})) if (o.flt.hasOwnProperty(a) && o.flt[a].length) c.flt[a] = o.flt[a].slice();
  for (var i = 0; i < ID_KEYS.length; i++) c.id[ID_KEYS[i]] = ((o.id || {})[ID_KEYS[i]] || []).slice();
  return c;
}
var DEFAULT_F = { per: 'last', dt: '', emp: CFG.emp[0], tcr: '', flt: {}, mu: [], lu: [], kp: [], id: {} };
function applied() { return MODEL.applied || DEFAULT_F; }
function staged() { return state.stage || applied(); }
function diffKeys(a, b) {
  var out = [];
  if ((a.per || 'last') !== (b.per || 'last') || (a.per === 'date' && a.dt !== b.dt)) out.push('per');
  if ((a.emp || CFG.emp[0]) !== (b.emp || CFG.emp[0])) out.push('emp');
  if ((a.tcr || '') !== (b.tcr || '')) out.push('tcr');
  for (var t = 0; t < CFG.trees.length; t++) { var tk = CFG.trees[t].key; if (!sameSet(a[tk], b[tk])) out.push(tk); }
  var idc = false;
  for (var i = 0; i < ID_KEYS.length; i++) if (!sameSet((a.id || {})[ID_KEYS[i]], (b.id || {})[ID_KEYS[i]])) idc = true;
  if (idc) out.push('ids');
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
// Ключ фильтра на строке: per, ids, emp, tcr, mu, lu, kp или f:<атрибут>.
function pillKey(k) { return k === 'per' || k === 'ids' || k === 'emp' || k === 'tcr' || isTreeKey(k) ? k : 'f:' + k; }
function attrOf(key) { return String(key).indexOf('f:') === 0 ? key.slice(2) : ''; }
function isSet(o, key) {
  if (key === 'per') return o.per === 'date';
  if (key === 'emp') return (o.emp || CFG.emp[0]) !== CFG.emp[0];
  if (key === 'tcr') return !!o.tcr;
  if (key === 'ids') return idCount(o) > 0;
  if (isTreeKey(key)) return (o[key] || []).length > 0;
  return ((o.flt || {})[attrOf(key)] || []).length > 0;
}
function anyFilter(o) {
  for (var g = 0; g < CFG.shelf.length; g++) for (var i = 0; i < CFG.shelf[g].keys.length; i++) if (isSet(o, pillKey(CFG.shelf[g].keys[i]))) return true;
  return false;
}
function setCount(o) {
  var n = 0;
  for (var g = 0; g < CFG.shelf.length; g++) for (var i = 0; i < CFG.shelf[g].keys.length; i++) if (isSet(o, pillKey(CFG.shelf[g].keys[i]))) n++;
  return n;
}
// Маска кросс-фильтра: носитель = основа + meta.cf; value = [] не шлём никогда. frq — метка запроса:
// вернётся в эхе и строки фильтров, и списка.
function maskOf(o) {
  var out = [], cf = MODEL.cf;
  function add(base, vals) {
    var v = [];
    for (var i = 0; i < (vals || []).length; i++) if (vals[i] !== null && vals[i] !== undefined && String(vals[i]) !== '') v.push(String(vals[i]));
    if (v.length) out.push({ column: base + cf, operator: 'IN', value: v });
  }
  if (o.per === 'date' && o.dt) { add('per', ['date']); add('dt', [o.dt]); }
  if (o.emp && o.emp !== CFG.emp[0]) add('emp', [o.emp]);
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
  if (o.q) add('q', [o.q]);
  add('frq', [o.frq]);
  return out;
}
// Значения атрибута: пришедшие + выбранные, которых нет в ответе; нули — серым и в конце.
function facetVals(attr) {
  var list = MODEL.facets[attr] || [], out = [], seen = {};
  for (var i = 0; i < list.length; i++) { out.push(list[i]); seen['~' + list[i].v] = 1; }
  var sel = staged().flt[attr] || [];
  for (var j = 0; j < sel.length; j++) if (!seen['~' + sel[j]]) out.push({ v: sel[j], n: null });
  out.sort(function (a, b) {
    var za = !a.n, zb = !b.n;
    if (za !== zb) return za ? 1 : -1;
    return (b.n || 0) - (a.n || 0) || (a.v < b.v ? -1 : (a.v > b.v ? 1 : 0));
  });
  return out;
}
// Имя и путь выбранного узла: из дерева, подписей датасета (роль s) или запомненные при выборе.
function nodeName(tk, v) {
  if (tk === 'kp') { var ps = String(v).split('\x1f'); return ps[ps.length - 1]; }
  var T = MODEL.trees[tk];
  if (T && T.by[v]) return T.by[v].name;
  if (MODEL.sel[tk + ':' + v]) return MODEL.sel[tk + ':' + v].name;
  if (state.names[tk + ':' + v]) return state.names[tk + ':' + v].name;
  return v;
}
function nodePath(tk, v) {
  if (tk === 'kp') return String(v).split('\x1f').join(' › ');
  var T = MODEL.trees[tk];
  if (T && T.by[v]) {
    var x = T.by[v], chain = [x.name], guard = 0;
    while (x.pid && T.by[x.pid] && guard++ < 16) { x = T.by[x.pid]; chain.unshift(x.name); }
    return chain.join(' › ');
  }
  var s = MODEL.sel[tk + ':' + v] || state.names[tk + ':' + v];
  return s && s.path ? s.path + ' › ' + nodeName(tk, v) : nodeName(tk, v);
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
// Строка — во всю ширину ячейки (корень width:100%); выпадашка — в body iframe, position:fixed.
function buildCSS() {
  var P = '.' + CFG.ns, C = CFG.colors, F = CFG.fonts, S = CFG.spacing;
  var SHL = '0 10px 30px rgba(20,28,45,.18),0 2px 6px rgba(20,28,45,.08)';
  return [
    '<style>',
    P + '-root{width:100%;box-sizing:border-box;font-family:' + F.family + ';font-size:' + F.body + 'px;color:' + C.ink + ';}',
    P + '-root *,' + P + '-dd *{box-sizing:border-box;font-family:inherit;}',
    // строка: слева пилюли в два ряда, справа «Применить»; фон — только у строки (развёрнутый iframe прозрачен)
    P + '-bar{display:flex;align-items:center;gap:12px;height:100%;padding:' + S.padY + 'px ' + S.padX + 'px;background:' + C.card + ';border-radius:12px;box-shadow:0 1px 3px rgba(20,28,45,.06),0 4px 16px rgba(20,28,45,.04);overflow:hidden;}',
    P + '-pills{flex:1 1 auto;min-width:0;display:flex;flex-wrap:wrap;align-content:flex-start;gap:' + S.rowGap + 'px 6px;max-height:' + (S.pillH * 2 + S.rowGap) + 'px;overflow:hidden;}',
    P + '-pill{display:inline-flex;align-items:center;gap:5px;height:' + S.pillH + 'px;max-width:230px;border:1px solid ' + C.line + ';background:' + C.card + ';border-radius:8px;padding:0 8px 0 10px;font-size:' + F.note + 'px;font-weight:500;color:' + C.ink2 + ';cursor:pointer;white-space:nowrap;flex:0 0 auto;}',
    P + '-pill:hover{border-color:#cfd5df;color:' + C.ink + ';}',
    P + '-pill' + P + '-set{background:' + C.blueBg + ';border-color:#dbe6fd;color:' + C.blueTx + ';}',
    P + '-pill' + P + '-chg{border-style:dashed;border-color:' + C.act + ';}',
    P + '-pill' + P + '-on{border-color:' + C.act + ';box-shadow:0 0 0 2px rgba(43,108,255,.12);}',
    P + '-pl{flex:0 0 auto;}',
    P + '-pill' + P + '-set ' + P + '-pl{color:#5b83dc;font-weight:400;}',
    P + '-pv{overflow:hidden;text-overflow:ellipsis;min-width:0;}',
    P + '-pc{color:' + C.muted2 + ';font-size:9px;flex:0 0 auto;}',
    P + '-x{display:inline-flex;align-items:center;justify-content:center;width:15px;height:15px;border-radius:50%;background:rgba(43,95,208,.14);color:' + C.blueTx + ';font-size:11px;line-height:1;cursor:pointer;flex:0 0 auto;}',
    P + '-x:hover{background:rgba(43,95,208,.3);}',
    P + '-cnt{display:inline-flex;align-items:center;justify-content:center;min-width:16px;height:16px;padding:0 5px;border-radius:999px;background:' + C.act + ';color:#fff;font-size:10px;font-weight:500;}',
    P + '-sep{flex:0 0 auto;width:1px;height:18px;background:' + C.line + ';align-self:center;margin:0 1px;}',
    P + '-acts{flex:0 0 auto;display:flex;flex-direction:column;justify-content:center;align-items:stretch;gap:' + S.rowGap + 'px;min-width:132px;}',
    P + '-arow{display:flex;gap:4px;justify-content:space-between;align-items:center;height:' + S.pillH + 'px;}',
    P + '-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:' + S.pillH + 'px;border:1px solid ' + C.line + ';background:' + C.card + ';border-radius:8px;padding:0 12px;font-weight:500;color:' + C.ink2 + ';cursor:pointer;font-size:' + F.control + 'px;white-space:nowrap;}',
    P + '-btn:hover{border-color:#d8dce4;}',
    P + '-btn' + P + '-pri{background:' + C.act + ';border-color:' + C.act + ';color:#fff;}',
    P + '-btn' + P + '-pri:hover{background:#1b5cf0;}',
    P + '-btn[disabled]{opacity:.45;cursor:default;}',
    P + '-btn' + P + '-pri[disabled]:hover{background:' + C.act + ';}',
    P + '-lnk{color:' + C.act + ';cursor:pointer;font-weight:500;border:0;background:transparent;padding:0 2px;font-size:' + F.note + 'px;}',
    P + '-lnk:hover{text-decoration:underline;}',
    P + '-lnk[disabled]{color:' + C.muted2 + ';cursor:default;text-decoration:none;}',
    P + '-st{font-size:' + F.note + 'px;color:' + C.muted + ';white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
    P + '-st' + P + '-warn{color:' + C.warnTx + ';white-space:normal;line-height:1.25;}',
    P + '-busy ' + P + '-pills{opacity:.6;transition:opacity .2s;}',
    // тултип и выпадашка — в body, вне корня: шрифт повторяем явно
    P + '-tip{position:fixed;z-index:99999;pointer-events:none;opacity:0;display:none;font-family:' + F.family + ';box-sizing:border-box;'
      + 'background:' + C.card + ';border:1px solid ' + C.line + ';border-radius:9px;box-shadow:' + SHL + ';padding:7px 10px;font-size:' + F.note + 'px;'
      + 'line-height:1.4;color:' + C.ink2 + ';font-weight:400;max-width:340px;white-space:normal;word-wrap:break-word;transition:opacity .08s;}',
    P + '-tip ' + P + '-t-h{display:block;font-size:10px;font-weight:500;letter-spacing:.3px;text-transform:uppercase;color:' + C.muted + ';margin-bottom:5px;}',
    P + '-tip ' + P + '-t-x{display:block;font-size:' + F.note + 'px;color:' + C.ink2 + ';}',
    P + '-tip ' + P + '-t-n{display:block;font-size:' + F.cap + 'px;color:' + C.muted + ';margin-top:5px;}',
    P + '-dd{position:fixed;z-index:9000;display:none;box-sizing:border-box;flex-direction:column;background:' + C.card + ';border:1px solid ' + C.line + ';border-radius:10px;box-shadow:' + SHL + ';padding:10px;font-family:' + F.family + ';font-size:' + F.body + 'px;color:' + C.ink + ';outline:none;}',
    P + '-ddh{display:flex;align-items:center;gap:8px;min-height:22px;margin:2px 4px 8px;font-size:' + F.cap + 'px;text-transform:uppercase;letter-spacing:.4px;color:' + C.muted + ';font-weight:500;}',
    P + '-ddh>span:first-child{flex:1;}',
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
    P + '-optv{margin-left:auto;padding-left:8px;color:' + C.blueTx + ';font-size:' + F.note + 'px;max-width:55%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
    P + '-rd{display:inline-block;flex:0 0 auto;width:14px;height:14px;border-radius:50%;border:1.5px solid ' + C.muted2 + ';}',
    P + '-opt' + P + '-cur ' + P + '-rd{border:4px solid ' + C.act + ';}',
    P + '-blk{font-size:' + F.cap + 'px;font-weight:500;color:' + C.muted + ';text-transform:uppercase;letter-spacing:.3px;margin:10px 9px 2px;}',
    P + '-nores{padding:14px 8px;color:' + C.muted + ';font-size:' + F.note + 'px;text-align:center;line-height:1.45;}',
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
    P + '-note{padding:10px 14px;font-size:' + F.note + 'px;color:' + C.warnTx + ';}',
    '</style>'
  ].join('');
}

var SEARCH_SVG = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true">'
  + '<circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.5" y2="16.5"/></svg>';
var NOTE_STAGE = 'Выбрано, но ещё не применено — кнопка «Применить».';
function hSearch(placeholder) {
  var P = CFG.ns;
  return '<label class="' + P + '-psearch">' + SEARCH_SVG + '<input class="' + P + '-srch" type="text" autocomplete="off" data-psearch="1"'
    + ' placeholder="' + esc(placeholder) + '" value="' + esc(state.q) + '"></label>';
}
function perText(o) { return o.per === 'date' && o.dt ? 'на ' + fmtDate(o.dt) : 'последний день'; }
function labelOf(key) {
  if (key === 'per') return 'Период';
  if (key === 'ids') return 'Сотрудники по списку';
  if (key === 'emp') return 'Численность';
  if (key === 'tcr') return 'Тип ЮЛ';
  if (isTreeKey(key)) return treeDef(key).label;
  return CFG.facetLabels[attrOf(key)] || attrOf(key);
}
function shortList(list) { return list.length ? list[0] + (list.length > 1 ? ' +' + (list.length - 1) : '') : ''; }
// Что показать в пилюле и подсказке: {value (текст выбора или ''), all (весь выбор), clear (ключ сброса)}.
function pillInfo(key, st) {
  if (key === 'per') return { value: st.per === 'date' ? perText(st) : '', all: perText(st) };
  if (key === 'emp') return { value: (st.emp || CFG.emp[0]) !== CFG.emp[0] ? String(st.emp).toLowerCase() : '', all: String(st.emp || CFG.emp[0]).toLowerCase() };
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
function clearKey(key) { return key === 'ids' ? 'ids' : key; }
function pillHTML(key, st, dk) {
  var P = CFG.ns, info = pillInfo(key, st), set = isSet(st, key), chg = inArr(dk, key), on = state.open === key;
  var tp = tip({ title: labelOf(key), text: set ? info.all : (key === 'per' || key === 'emp' ? info.all : 'Все значения'),
    note: chg ? NOTE_STAGE : (isTreeKey(key) ? 'Дерево всех уровней и поиск по названию' : key === 'ids' ? 'Вставка списка MasterID, логинов, табельных'
      : 'Число у значения — сотрудники при остальных фильтрах') });
  return '<button class="' + P + '-pill' + (set ? ' ' + P + '-set' : '') + (chg ? ' ' + P + '-chg' : '') + (on ? ' ' + P + '-on' : '') + '"'
    + ' data-action="open" data-pop="' + esc(key) + '" data-k="' + esc(key) + '" aria-haspopup="true" aria-expanded="' + (on ? 'true' : 'false') + '"' + tp + '>'
    + '<span class="' + P + '-pl">' + esc(labelOf(key)) + (set ? ':' : '') + '</span>'
    + (set ? '<span class="' + P + '-pv">' + esc(info.value) + '</span><span class="' + P + '-x" role="button" tabindex="0" aria-label="Снять фильтр" data-action="clr" data-key="' + esc(clearKey(key)) + '">×</span>'
      : '<span class="' + P + '-pc">▾</span>')
    + '</button>';
}
function applyHTML() {
  var P = CFG.ns, n = stageDiff(), busy = !!state.pend;
  var s = '<button class="' + P + '-btn ' + P + '-pri" data-action="apply"' + (n && !busy ? '' : ' disabled')
    + tip({ title: 'Применить', text: n ? 'Изменено фильтров: ' + n + '. Список и счётчики пересчитаются одним запросом.' : 'Выберите значения — применятся все сразу.' })
    + '>' + (busy && state.pend.kind === 'apply' ? 'Применяю…' : 'Применить' + (n ? ' · ' + n : '')) + '</button>';
  s += '<div class="' + P + '-arow">'
    + '<button class="' + P + '-lnk" data-action="unstage"' + (n ? '' : ' disabled') + '>Отменить</button>'
    + '<button class="' + P + '-lnk" data-action="reset"' + (anyFilter(applied()) || n ? '' : ' disabled')
    + tip({ title: 'Сбросить все', text: 'Снять все фильтры сразу, без «Применить».' }) + '>Сбросить</button></div>';
  return s;
}
function statusHTML() {
  var P = CFG.ns;
  if (state.warn) return '<div class="' + P + '-st ' + P + '-warn">' + esc(state.warn) + '</div>';
  return '';
}
function buildHTML() {
  var P = CFG.ns;
  if (MODEL.err) {
    var msg = MODEL.err === 'empty' ? CFG.text.noData + ': проверьте, что чарт смотрит на датасет строки фильтров'
      : MODEL.err === 'columns' ? 'В данных чарта нет колонок: ' + MODEL.missing.join(', ') + ' — добавьте role, k, v, n, j в «Измерения»'
      : 'Нет служебной строки meta: увеличьте лимит строк чарта';
    return buildCSS() + '<div class="' + P + '-root"><div class="' + P + '-bar"><div class="' + P + '-note">' + esc(msg) + '</div></div></div>';
  }
  if (!MODEL.ok) return buildCSS() + '<div class="' + P + '-root"><div class="' + P + '-bar"><div class="' + P + '-note">' + esc(CFG.text.noAccess) + '</div></div></div>';
  var st = staged(), dk = diffKeys(applied(), st), s = '';
  for (var g = 0; g < CFG.shelf.length; g++) {
    if (g) s += '<span class="' + P + '-sep" data-sep="1"></span>';
    for (var i = 0; i < CFG.shelf[g].keys.length; i++) s += pillHTML(pillKey(CFG.shelf[g].keys[i]), st, dk);
  }
  s += '<button class="' + P + '-pill" data-action="open" data-pop="more" data-more="1" aria-haspopup="true" aria-expanded="' + (state.open === 'more' ? 'true' : 'false') + '" style="display:none">'
    + '<span class="' + P + '-pl" data-morelb="1">Ещё</span><span class="' + P + '-pc">▾</span></button>';
  return buildCSS() + '<div class="' + P + '-root' + (state.pend && state.pend.kind === 'apply' ? ' ' + P + '-busy' : '') + '" style="height:100%">'
    + '<div class="' + P + '-bar" data-bar="1"><div class="' + P + '-pills" data-pills="1">' + s + '</div>'
    + '<div class="' + P + '-acts" data-acts="1">' + applyHTML() + statusHTML() + '</div></div></div>';
}

// ---- выпадашки ----
function ddWidth(key) {
  if (isTreeKey(key)) return CFG.widths.tree;
  if (key === 'ids') return CFG.widths.ids;
  if (key === 'more') return CFG.widths.more;
  if (key === 'per' || key === 'emp' || key === 'tcr') return CFG.widths.one;
  return CFG.widths.facet;
}
function ddFoot(text, clearAct, clearKey2) {
  var P = CFG.ns, n = stageDiff();
  return '<div class="' + P + '-ddf"><span data-pcount="1">' + esc(text) + '</span>'
    + (clearAct ? '<button class="' + P + '-btn" data-action="' + clearAct + '" data-key="' + esc(clearKey2 || '') + '">Очистить</button>' : '')
    + '<button class="' + P + '-btn ' + P + '-pri" data-action="apply"' + (n && !state.pend ? '' : ' disabled') + '>Применить' + (n ? ' · ' + n : '') + '</button></div>';
}
function perDD() {
  var P = CFG.ns, st = staged();
  return '<div class="' + P + '-ddh"><span>Период</span></div>'
    + '<div class="' + P + '-opt' + (st.per !== 'date' ? ' ' + P + '-cur' : '') + '" data-action="setper" data-key="last"><span class="' + P + '-rd"></span>'
    + '<span class="' + P + '-optt">Последний день</span><span class="' + P + '-optn">' + esc(fmtDate(MODEL.m.data_dt)) + '</span></div>'
    + '<div class="' + P + '-blk">На дату</div>'
    + (MODEL.dates.length > 8 ? hSearch('Дата, например 31.08') : '')
    + '<div class="' + P + '-list" data-plist="1">' + perListHTML() + '</div>'
    + ddFoot('Выберите и нажмите «Применить»', '', '');
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
function choiceDD(key) {
  var P = CFG.ns, cur = staged()[key] || '', list = key === 'emp' ? CFG.emp : [''].concat(CFG.tcr), s = '';
  s += '<div class="' + P + '-ddh"><span>' + esc(labelOf(key)) + '</span></div><div class="' + P + '-list">';
  for (var i = 0; i < list.length; i++) {
    s += '<div class="' + P + '-opt' + (list[i] === cur || (key === 'emp' && !cur && i === 0) ? ' ' + P + '-cur' : '') + '" data-action="set1" data-key="' + key + '" data-v="' + esc(list[i]) + '">'
      + '<span class="' + P + '-rd"></span><span class="' + P + '-optt">' + esc(list[i] || 'Все') + '</span></div>';
  }
  return s + '</div>' + ddFoot(key === 'emp' ? 'Юридическая — по юрлицу; активная — по активной численности' : 'Только сотрудники ТЦР выбранного типа', '', '');
}
// Атрибут: значения со счётчиками при остальных фильтрах; поиск — по пришедшим, в датасет — если пришли не все.
function fltCountText(attr) {
  var n = (staged().flt[attr] || []).length;
  return n ? 'Выбрано: ' + n : 'Все значения — число сотрудников при остальных фильтрах';
}
function fltValsHTML(attr) {
  var P = CFG.ns, q = lower(trim(state.q)), sel = staged().flt[attr] || [], nv = MODEL.nv[attr] || 0, got = (MODEL.facets[attr] || []).length;
  var remote = q.length >= CFG.searchMin && nv > got, list = facetVals(attr), s = '', n = 0, cut = false;
  if (remote) {
    if (!searchEcho('f:' + attr + '=')) return '<div class="' + P + '-nores">Ищу «' + esc(trim(state.q)) + '» среди ' + fmtInt(nv) + ' значений…</div>';
    list = MODEL.fq[attr] || [];
  }
  for (var i = 0; i < list.length; i++) {
    var v = list[i].v, lb = valLabel(attr, v);
    if (q && !remote && lower(lb).indexOf(q) < 0 && lower(v).indexOf(q) < 0) continue;
    if (n >= CFG.listMax && !inArr(sel, v)) { cut = true; continue; }
    n++;
    s += '<label class="' + P + '-opt' + (list[i].n === 0 ? ' ' + P + '-zero' : '') + '"><input type="checkbox" data-fk="' + esc(attr) + '" data-fv="' + esc(v) + '"'
      + (inArr(sel, v) ? ' checked' : '') + '><span class="' + P + '-optt">' + hl(lb, q) + '</span>'
      + '<span class="' + P + '-optn">' + (list[i].n === null ? '' : fmtInt(list[i].n)) + '</span></label>';
  }
  if (!n) return '<div class="' + P + '-nores">' + (list.length ? 'Ничего не найдено' : 'Значений нет') + '</div>';
  if (cut) s += '<div class="' + P + '-nores">Показаны первые ' + CFG.listMax + ' — остальные найдёт поиск</div>';
  else if (!q && nv > got) s += '<div class="' + P + '-nores">Пришли ' + fmtInt(got) + ' из ' + fmtInt(nv) + ' значений — остальные найдёт поиск</div>';
  return s;
}
function fltDD(attr) {
  var P = CFG.ns, nv = MODEL.nv[attr] || 0, sel = staged().flt[attr] || [];
  return '<div class="' + P + '-ddh"><span>' + esc(CFG.facetLabels[attr] || attr) + '</span><span class="' + P + '-muted">' + fmtInt(nv) + ' ' + plural(nv, 'значение', 'значения', 'значений') + '</span></div>'
    + hSearch('Поиск значения')
    + '<div class="' + P + '-list" data-plist="1">' + fltValsHTML(attr) + '</div>'
    + ddFoot(fltCountText(attr), sel.length ? 'fclear' : '', attr);
}
// ---- структуры: дерево всех уровней, поиск по названию ----
function selMap(tk) { var s = {}, l = staged()[tk] || []; for (var i = 0; i < l.length; i++) s[l[i]] = 1; return s; }
function underSel(tk, T, x, S) {
  if (tk === 'kp') {
    var ps = String(x.id).split('\x1f');
    for (var i = 1; i < ps.length; i++) if (S[ps.slice(0, i).join('\x1f')]) return true;
    return false;
  }
  var p = x.pid, guard = 0;
  while (p && T.by[p] && guard++ < 16) { if (S[p]) return true; p = T.by[p].pid; }
  return false;
}
function selAnc(tk, T) {
  var out = {}, l = staged()[tk] || [];
  for (var i = 0; i < l.length; i++) {
    var x = T.by[l[i]], guard = 0;
    if (!x && tk === 'kp') { var ps = String(l[i]).split('\x1f'); for (var j = 1; j < ps.length; j++) out[ps.slice(0, j).join('\x1f')] = 1; continue; }
    while (x && x.pid && guard++ < 16) { out[x.pid] = 1; x = T.by[x.pid]; }
  }
  return out;
}
function tIsOpen(tk, T, id, depth, anc) {
  var k = tk + ':' + id;
  if (state.treeOpen.hasOwnProperty(k)) return !!state.treeOpen[k];
  return !!anc[id] || (depth === 0 && T.roots.length === 1);
}
function treeRowHTML(tk, x, depth, on, inSel, open, canOpen, q, path) {
  var P = CFG.ns;
  return '<div class="' + P + '-tr' + (x.n ? '' : ' ' + P + '-zero') + '" style="padding-left:' + (depth * 16) + 'px">'
    + (canOpen ? '<button class="' + P + '-tw" data-action="tw" data-key="' + tk + '" data-ti="' + x.ix + '" aria-expanded="' + (open ? 'true' : 'false') + '">'
      + (open ? '▾' : '▸') + '</button>' : '<span class="' + P + '-tsp"></span>')
    + '<label class="' + P + '-tl"><input type="checkbox" data-tsel="' + tk + '" data-ti="' + (x.ix === undefined ? '' : x.ix) + '" data-tq="' + (x.ix === undefined ? esc(x.id) : '') + '"'
    + (on || inSel ? ' checked' : '') + (inSel ? ' disabled' : '') + '>'
    + '<span class="' + P + '-tn' + (path !== null ? ' ' + P + '-wrap' : '') + '">' + hl(x.name, q) + (inSel ? '<span class="' + P + '-tin">в выбранном</span>' : '')
    + (path ? '<span class="' + P + '-tpath">' + esc(path) + '</span>' : '') + '</span>'
    + '<span class="' + P + '-tc">' + fmtInt(x.n) + '</span></label></div>';
}
function treeRows(tk, T, id, depth, S, anc, out) {
  if (out.n >= CFG.treeRowsMax) { out.cut = true; return; }
  var P = CFG.ns, x = T.by[id];
  if (!x) return;
  out.n++;
  var kids = T.kids[id] || [], canOpen = kids.length > 0 || x.hk, open = canOpen && tIsOpen(tk, T, id, depth, anc);
  var inSel = out.inSel || underSel(tk, T, x, S), on = !!S[x.id];
  out.s += treeRowHTML(tk, x, depth, on, inSel && !on, open, canOpen, '', null);
  if (!open) return;
  if (!kids.length) {
    out.s += '<div class="' + P + '-nores" style="text-align:left;padding:4px 0 4px ' + ((depth + 1) * 16 + 22) + 'px">Подразделения не пришли — найдите юнит поиском</div>';
    return;
  }
  var was = out.inSel;
  out.inSel = inSel || on;
  for (var i = 0; i < kids.length; i++) treeRows(tk, T, kids[i], depth + 1, S, anc, out);
  out.inSel = was;
}
function pathOf(tk, T, x) {
  var chain = [], p = x.pid, guard = 0;
  while (p && T.by[p] && guard++ < 16) { chain.unshift(T.by[p].name); p = T.by[p].pid; }
  return chain.join(' › ');
}
function searchEcho(prefix) {
  var e = MODEL.qEcho;
  return e.indexOf(prefix) === 0 && lower(e.slice(prefix.length)) === lower(trim(state.q)).slice(0, 60);
}
function treeListHTML(tk) {
  var P = CFG.ns, T = MODEL.trees[tk], q = lower(trim(state.q)), S = selMap(tk);
  if (!T) return '<div class="' + P + '-nores">Структура не пришла в ответе</div>';
  if (q && q.length >= CFG.searchMin) {
    var hits = [], s = '';
    if (T.full) {
      for (var i = 0; i < T.nodes.length; i++) {
        var x = T.nodes[i], at = lower(x.name).indexOf(q);
        if (at > -1) hits.push({ x: x, r: (at === 0 ? 0 : 1) * 1e9 - x.n });
      }
      hits.sort(function (a, b) { return a.r - b.r; });
      for (var h = 0; h < hits.length && h < 150; h++) {
        var y = hits[h].x;
        s += treeRowHTML(tk, y, 0, !!S[y.id], !S[y.id] && underSel(tk, T, y, S), false, false, q, pathOf(tk, T, y));
      }
      if (!hits.length) return '<div class="' + P + '-nores">Ничего не найдено</div>';
      if (hits.length > 150) s += '<div class="' + P + '-nores">Показаны первые 150 из ' + fmtInt(hits.length) + ' — уточните запрос</div>';
      return s;
    }
    if (!searchEcho(tk + '=')) return '<div class="' + P + '-nores">Ищу «' + esc(trim(state.q)) + '» по всей структуре…</div>';
    for (var k = 0; k < MODEL.q.length; k++) {
      var z = MODEL.q[k];
      if (z.k !== tk) continue;
      hits.push(z);
      s += treeRowHTML(tk, z, 0, !!S[z.id], false, false, false, q, z.path);
    }
    return hits.length ? s : '<div class="' + P + '-nores">Ничего не найдено</div>';
  }
  if (q) return '<div class="' + P + '-nores">Введите от ' + CFG.searchMin + ' букв</div>';
  if (!T.roots.length) return '<div class="' + P + '-nores">Юнитов нет</div>';
  var anc = selAnc(tk, T), out = { s: '', n: 0, cut: false, inSel: false };
  for (var r = 0; r < T.roots.length; r++) treeRows(tk, T, T.roots[r], 0, S, anc, out);
  if (out.cut) out.s += '<div class="' + P + '-nores">Показаны первые ' + CFG.treeRowsMax + ' строк — найдите юнит поиском</div>';
  return out.s;
}
function treeCountText(tk) {
  var n = (staged()[tk] || []).length, d = treeDef(tk);
  return n ? 'Выбрано: ' + n + ' из ' + d.max + ' · сотрудник — в списке, если его юнит внутри выбранного' : 'Ничего не выбрано — вся структура';
}
function treeDD(tk) {
  var P = CFG.ns, T = MODEL.trees[tk];
  return '<div class="' + P + '-ddh"><span>' + esc(treeDef(tk).name) + '</span>'
    + (T ? '<span class="' + P + '-muted">' + fmtInt(T.total) + ' ' + plural(T.total, 'юнит', 'юнита', 'юнитов') + '</span>' : '') + '</div>'
    + hSearch(T && !T.full ? 'Поиск юнита по всей структуре (от 2 букв)' : 'Поиск юнита по названию на любом уровне')
    + '<div class="' + P + '-list" data-plist="1">' + treeListHTML(tk) + '</div>'
    + ddFoot(treeCountText(tk), (staged()[tk] || []).length ? 'tclear' : '', tk);
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
  for (var i = 0; i < CFG.idKinds.length; i++) {
    var d = CFG.idKinds[i], n = (st.id[d.key] || []).length;
    s += '<button class="' + P + '-segb' + (d.key === kind ? ' ' + P + '-on' : '') + '" data-action="idk" data-key="' + d.key + '" role="tab" aria-selected="' + (d.key === kind ? 'true' : 'false') + '">'
      + esc(d.label) + (n ? '<i>' + n + '</i>' : '') + '</button>';
  }
  s += '</span></div><textarea class="' + P + '-ta" data-ids="' + kind + '" spellcheck="false" placeholder="Вставьте ' + esc(CFG.idKinds[ID_KEYS.indexOf(kind)].label)
    + ' — по одному в строке, через запятую или пробел">' + esc((st.id[kind] || []).join('\n')) + '</textarea>'
    + '<div class="' + P + '-idinfo" data-idinfo="1">' + idInfoHTML() + '</div>';
  return s + ddFoot('Сотрудник попадёт в список, если совпал хотя бы с одним значением', 'idclear', kind);
}
// «Ещё»: фильтры, не влезшие в два ряда.
function moreDD() {
  var P = CFG.ns, st = staged(), s = '<div class="' + P + '-ddh"><span>Ещё фильтры</span></div><div class="' + P + '-list">';
  for (var i = 0; i < state.overflow.length; i++) {
    var key = state.overflow[i], info = pillInfo(key, st), set = isSet(st, key);
    s += '<div class="' + P + '-opt' + (set ? ' ' + P + '-cur' : '') + '" data-action="open" data-pop="' + esc(key) + '" data-via="more">'
      + '<span class="' + P + '-optt">' + esc(labelOf(key)) + '</span>' + (set ? '<span class="' + P + '-optv">' + esc(info.value) + '</span>' : '<span class="' + P + '-optn">▸</span>') + '</div>';
  }
  return s + '</div>';
}
function ddHTML() {
  var o = state.open;
  if (o === 'per') return perDD();
  if (o === 'emp' || o === 'tcr') return choiceDD(o);
  if (o === 'ids') return idsDD();
  if (o === 'more') return moreDD();
  if (isTreeKey(o)) return treeDD(o);
  if (attrOf(o)) return fltDD(attrOf(o));
  return '';
}
function listHTML() {
  var o = state.open;
  if (o === 'per') return perListHTML();
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
    // Фон — только у строки: развёрнутый iframe (выпадашка открыта) прозрачен и не закрывает список.
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
    // getBoundingClientRect() как есть, клампинг по окну.
    function showTip(html, rect) {
      var tip = getTip();
      if (tip.__h !== html) { tip.innerHTML = html; tip.__h = html; }
      tip.style.display = 'block';
      tip.style.left = '0px';
      tip.style.top = '0px';
      var t = tip.getBoundingClientRect();
      var pad = 6, gap = 8;
      var left = rect.left + rect.width / 2 - t.width / 2;
      var top = rect.top + rect.height + gap;
      if (top + t.height > window.innerHeight - pad) top = rect.top - t.height - gap;
      left = Math.max(pad, Math.min(left, window.innerWidth - t.width - pad));
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
      var el = state.tip.el && state.tip.el.parentNode ? state.tip.el : null;
      showTip(state.tip.html, el ? el.getBoundingClientRect() : state.tip.rect);
    }

    // ── ВЫПАДАШКА ── один узел в overlay рядом с корнем строки, position:fixed: выходит за строку
    // (overflow overlay его не режет), а iframe при открытии вырастает (CSS борда по маркеру) — места хватает.
    // Разметку строки render() пишет в свой контейнер — выпадашка переживает пересборку.
    var barBox = document.createElement('div');
    barBox.style.cssText = 'width:100%;height:100%;';
    overlay.appendChild(barBox);
    var ddEl = null;
    function getDd() {
      if (ddEl && ddEl.parentNode) return ddEl;
      ddEl = document.createElement('div');
      ddEl.className = CFG.ns + '-dd';
      ddEl.setAttribute('tabindex', '-1');
      overlay.appendChild(ddEl);
      // Клики, ввод и клавиши выпадашки ловят делегированные обработчики overlay (она внутри него).
      return ddEl;
    }

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
    function wantBig() { return !!state.open || !!state.tipBig; }
    function signal() {
      var big = wantBig();
      if (big === state.sig) return;
      if (big && !state.pin) state.baseH = overlay.clientHeight || state.baseH;
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
      // Высота строки закреплена, пока iframe развёрнут; отпускаем, когда окно вернулось к высоте строки
      // (родитель сжимает iframe не сразу — иначе строка на кадр прыгает).
      if (big || (state.baseH && window.innerHeight > state.baseH + 4)) {
        overlay.style.height = state.baseH ? state.baseH + 'px' : '100%';
        state.pin = !!state.baseH;
      } else { overlay.style.height = '100%'; state.pin = false; }
    }
    function unpinIfShrunk() {
      if (state.pin && !wantBig() && window.innerHeight <= state.baseH + 4) { overlay.style.height = '100%'; state.pin = false; }
    }

    // Два ряда пилюль: не влезло — в «Ещё». Прячутся сначала незаданные атрибуты с конца; период,
    // численность, список сотрудников, структуры и всё заданное остаются на виду (порядок — как на борде 7241).
    function hidePri(key, st) {
      var base = key === 'per' || key === 'emp' ? 50 : isTreeKey(key) ? 40 : key === 'ids' ? 30 : key === 'tcr' ? 20 : 0;
      return base + (isSet(st, key) ? 100 : 0);
    }
    function fitPills() {
      var box = barBox.querySelector('[data-pills]');
      if (!box) return;
      var pills = box.querySelectorAll('[data-k]'), seps = box.querySelectorAll('[data-sep]'), more = box.querySelector('[data-more]');
      var j, st = staged();
      for (j = 0; j < pills.length; j++) pills[j].style.display = '';
      for (j = 0; j < seps.length; j++) seps[j].style.display = '';
      if (more) more.style.display = 'none';
      if (!pills.length || !more) return;
      // второй ряд — от верха первого видимого элемента (ряды прижаты к верху контейнера)
      var first = function () { for (var i = 0; i < box.children.length; i++) if (box.children[i].style.display !== 'none') return box.children[i]; return more; };
      var row2 = function () { return first().offsetTop + CFG.spacing.pillH + CFG.spacing.rowGap + 2; };
      var hidden = [];
      if (pills[pills.length - 1].offsetTop > row2()) {
        more.style.display = '';
        var order = [];
        for (j = 0; j < pills.length; j++) order.push(j);
        order.sort(function (x, y) {
          var px = hidePri(pills[x].getAttribute('data-k'), st), py = hidePri(pills[y].getAttribute('data-k'), st);
          return px - py || y - x;
        });
        for (j = 0; j < order.length && more.offsetTop > row2(); j++) { pills[order[j]].style.display = 'none'; hidden.push(order[j]); }
        // разделитель в начале ряда или подряд с другим — лишний
        var prevSep = true;
        for (j = 0; j < box.children.length; j++) {
          var el = box.children[j];
          if (el.style.display === 'none') continue;
          if (el.getAttribute('data-sep') !== null) { if (prevSep) el.style.display = 'none'; prevSep = true; } else prevSep = false;
        }
      }
      hidden.sort(function (x, y) { return x - y; });
      var keys = [], nset = 0;
      for (j = 0; j < hidden.length; j++) { var k = pills[hidden[j]].getAttribute('data-k'); keys.push(k); if (isSet(st, k)) nset++; }
      state.overflow = keys;
      var lb = more.querySelector('[data-morelb]');
      if (lb) lb.innerHTML = 'Ещё ' + keys.length + (nset ? ' <span class="' + CFG.ns + '-cnt">' + nset + '</span>' : '');
      more.className = CFG.ns + '-pill' + (nset ? ' ' + CFG.ns + '-set' : '') + (state.open === 'more' ? ' ' + CFG.ns + '-on' : '');
    }

    function anchorOf() {
      var key = state.via === 'more' && inArr(state.overflow, state.open) ? 'more' : state.open;
      return overlay.querySelector('[data-pop="' + key + '"]');
    }
    function placeDd() {
      var dd = getDd();
      if (!state.open) { dd.style.display = 'none'; return; }
      var btn = anchorOf(), r = btn ? btn.getBoundingClientRect() : { left: 8, bottom: 40 };
      var w = Math.min(ddWidth(state.open), window.innerWidth - 16);
      var top = Math.round(r.bottom + 6);
      var left = Math.max(8, Math.min(Math.round(r.left), window.innerWidth - w - 8));
      dd.style.display = 'flex';
      dd.style.width = w + 'px';
      dd.style.left = left + 'px';
      dd.style.top = top + 'px';
      dd.style.maxHeight = Math.max(160, Math.min(560, window.innerHeight - top - 12)) + 'px';
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
    function render() {
      barBox.innerHTML = buildHTML();
      fitPills();
      renderDd();
      renderTip();
    }
    // Набранное без пересборки выпадашки (поле поиска и каретка живут): строка, список, подвал.
    function refreshStage() {
      barBox.innerHTML = buildHTML();
      fitPills();
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
    }
    function openDd(key, via) {
      state.open = key || '';
      state.via = via || '';
      state.q = '';
      if (state.qT) { clearTimeout(state.qT); state.qT = null; }
      state.tip = null;
      state.tipBig = false;
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

    // ── НАВЕДЕНИЕ: подсказка у заданного фильтра и кнопок. Строка тонкая — на время подсказки iframe
    // разворачивается тем же сигналом, что и для выпадашки; ушёл курсор — через 160 мс обратно.
    var tipHideT = null;
    function onMove(e) {
      var el = trigger(e.target, 'data-tip');
      if (el && el.getAttribute('aria-expanded') === 'true') el = null;
      if (el && ddEl && ddEl.contains(el)) el = null;
      if (!el || state.open) {
        if (state.tip && !tipHideT) tipHideT = setTimeout(function () { tipHideT = null; state.tip = null; hideTip(); state.tipBig = false; signal(); unpinIfShrunk(); }, 160);
        return;
      }
      if (tipHideT) { clearTimeout(tipHideT); tipHideT = null; }
      var html = el.getAttribute('data-tip') || '';
      state.tip = { html: html, el: el, rect: el.getBoundingClientRect() };
      if (!state.tipBig) { state.tipBig = true; signal(); }
      renderTip();
    }
    function onLeave() {
      if (tipHideT) { clearTimeout(tipHideT); tipHideT = null; }
      if (state.tip || state.tipBig) { state.tip = null; hideTip(); state.tipBig = false; signal(); }
    }

    // ── ЭМИССИЯ ── кросс-фильтр на себя (счётчики) и на список вкладки (строки); метка frq снимает ожидание.
    function armPend() {
      if (state.pendT) clearTimeout(state.pendT);
      state.pendT = null;
      if (!state.pend) return;
      var left = Math.max(200, CFG.pendingWarnMs - (Date.now() - state.pend.at));
      state.pendT = setTimeout(function () {
        state.pendT = null;
        if (!state.pend) return;
        state.pend = null;
        state.warn = CFG.text.notApplied;
        if (state.rerender) state.rerender();
      }, left);
    }
    function emit(f, o) {
      o = o || {};
      if (typeof applyCrossFilter !== 'function') { state.warn = CFG.text.noCf; render(); return; }
      state.warn = '';
      state.rqN = (state.rqN || 0) + 1;
      var m = copyF(f);
      m.frq = 'f' + state.rqN + '.' + (Date.now() % 1000000);
      m.q = o.q || '';
      state.pend = { frq: m.frq, at: Date.now(), kind: o.kind || 'apply' };
      armPend();
      if (state.pend.kind === 'apply') {
        state.open = ''; state.q = ''; state.tip = null; state.tipBig = false; hideTip(); signal();
        bcast({ type: 'DL_FLT', cf: MODEL.cf, frq: m.frq });
      }
      render();
      applyCrossFilter(maskOf(m));
    }
    // Поиск в датасете — только если пришло не всё (значений атрибута или узлов дерева больше).
    function searchNeeded() {
      var q = trim(state.q);
      if (q.length < CFG.searchMin) return '';
      if (isTreeKey(state.open)) {
        var T = MODEL.trees[state.open];
        if (!T || T.full || searchEcho(state.open + '=')) return '';
        return state.open + '=' + q.slice(0, 60);
      }
      var a = attrOf(state.open);
      if (a && (MODEL.nv[a] || 0) > (MODEL.facets[a] || []).length && !searchEcho('f:' + a + '=')) return 'f:' + a + '=' + q.slice(0, 60);
      return '';
    }
    function searchLater(now) {
      if (state.qT) { clearTimeout(state.qT); state.qT = null; }
      if (!searchNeeded()) return;
      var go = function () {
        state.qT = null;
        var q2 = searchNeeded();
        if (q2) emit(applied(), { q: q2, kind: 'search' });
      };
      if (now) go(); else state.qT = setTimeout(go, CFG.searchDelay);
    }
    function nodeOf(tk, t) {
      var T = MODEL.trees[tk], ti = t.getAttribute('data-ti'), tq = t.getAttribute('data-tq');
      if (T && ti !== null && ti !== '') return { x: T.nodes[+ti], path: pathOf(tk, T, T.nodes[+ti]) };
      for (var i = 0; i < MODEL.q.length; i++) if (MODEL.q[i].k === tk && MODEL.q[i].id === tq) return { x: MODEL.q[i], path: MODEL.q[i].path };
      return null;
    }

    function onClick(e) {
      var a = trigger(e.target, 'data-action');
      if (!a) return;
      var act = a.getAttribute('data-action'), key = a.getAttribute('data-key') || '';
      if (act === 'open') {
        var pop = a.getAttribute('data-pop') || '';
        if (state.open === pop) { openDd(''); return; }
        openDd(pop, a.getAttribute('data-via') || '');
        return;
      }
      if (act === 'clr') {
        stageEdit(function (st) {
          if (key === 'per') { st.per = 'last'; st.dt = ''; }
          else if (key === 'emp') st.emp = CFG.emp[0];
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
        stageEdit(function (st) { st[key] = key === 'emp' ? (sv || CFG.emp[0]) : sv; });
        refreshStage();
        return;
      }
      if (act === 'apply') {
        if (!stageDiff() || state.pend) return;
        emit(staged(), { kind: 'apply' });
        return;
      }
      if (act === 'unstage') { state.stage = null; render(); return; }
      if (act === 'reset') { state.stage = null; emit(DEFAULT_F, { kind: 'apply' }); return; }
      if (act === 'tw') {
        var T = MODEL.trees[key], x = T ? T.nodes[+a.getAttribute('data-ti')] : null;
        if (!x) return;
        var depth = 0, p = x.pid, guard = 0;
        while (p && T.by[p] && guard++ < 16) { depth++; p = T.by[p].pid; }
        state.treeOpen[key + ':' + x.id] = !tIsOpen(key, T, x.id, depth, selAnc(key, T));
        refreshStage();
        return;
      }
      if (act === 'tclear') { stageEdit(function (st) { st[key] = []; }); refreshStage(); return; }
      if (act === 'fclear') { stageEdit(function (st) { delete st.flt[key]; }); refreshStage(); return; }
      if (act === 'idk') { state.idKind = key; state.idBad = 0; renderDd(); focusDd(); return; }
      if (act === 'idclear') { state.idBad = 0; stageEdit(function (st) { st.id[key] = []; }); renderDd(); barBox.innerHTML = buildHTML(); fitPills(); focusDd(); return; }
    }

    // Чекбоксы: change, не click (label/input дают оба события).
    function onChange(e) {
      var t = e.target;
      if (!t || !t.getAttribute) return;
      var tk = t.getAttribute('data-tsel');
      if (tk) {
        var f = nodeOf(tk, t);
        if (!f) return;
        var v = f.x.id, max = treeDef(tk).max, full = false;
        if (tk !== 'kp') state.names[tk + ':' + v] = { name: f.x.name, path: f.path };
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
        searchLater(false);
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
      if (k === 13 && t && t.getAttribute && t.getAttribute('data-psearch') !== null) { e.preventDefault(); searchLater(true); return; }
      if (k === 27 && state.open) { openDd(''); return; }
      if ((k === 13 || k === 32) && t && t.getAttribute && t.getAttribute('role') === 'button' && t.tagName !== 'BUTTON') {
        e.preventDefault();
        onClick({ target: t });
      }
    }

    overlay.addEventListener('mousemove', onMove);
    overlay.addEventListener('mouseleave', onLeave);
    // Клик по строке помечается так же, как клик в выпадашке: пересборка отрывает цель от DOM.
    overlay.addEventListener('click', function (e) { e.__dd = true; onClick(e); });
    overlay.addEventListener('keydown', onKeydown);
    overlay.addEventListener('change', onChange);
    overlay.addEventListener('input', onInput);
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
      if (state.tip || state.tipBig) { state.tip = null; hideTip(); state.tipBig = false; signal(); }
    };
    window.addEventListener('blur', state.onBlur);
    if (state.onDocKey) document.removeEventListener('keydown', state.onDocKey, true);
    state.onDocKey = function (ev) {
      if ((ev.keyCode || ev.which) === 27 && state.open && !(ddEl && ddEl.contains(ev.target))) openDd('');
    };
    document.addEventListener('keydown', state.onDocKey, true);
    state.rerender = render;

    // Ответ пришёл: метка совпала с ожиданием — снимаем его; набранное применилось.
    var frq = MODEL.m ? MODEL.m.frq || '' : '';
    if (state.pend && frq && frq === state.pend.frq) {
      if (state.pend.kind === 'apply') state.stage = null;
      state.pend = null;
      if (state.warn === CFG.text.notApplied) state.warn = '';
    } else if (state.pend && Date.now() - state.pend.at > CFG.pendingWarnMs) {
      state.pend = null;
      state.warn = CFG.text.notApplied;
    }
    if (state.stage && !stageDiff()) state.stage = null;
    armPend();
    state.tip = null;
    state.tipBig = false;

    render();
    // Перезапуск скрипта (новый ответ) при открытой выпадашке: скриншот платформы мог затереть маркер —
    // повторяем сигнал; курсор — снова в поле поиска.
    if (state.open) {
      state.sig = false;
      signal();
      setTimeout(function () { if (state.open) { state.sig = false; signal(); } }, 400);
      focusDd();
    } else if (state.sig) { state.sig = true; state.tipBig = false; signal(); }

    // ResizeObserver только правит габариты (ряды пилюль, место выпадашки). render() не вызывать.
    if (typeof ResizeObserver !== 'undefined') {
      if (state.ro && state.ro.disconnect) state.ro.disconnect();
      var ro = new ResizeObserver(function () {
        overlay.style.width = '100%';
        if (!state.pin) overlay.style.height = '100%';
        fitPills();
        placeDd();
      });
      ro.observe(host);
      state.ro = ro;
    }
  } catch (e) {
    var box = null;
    var hs = document.querySelectorAll('[_echarts_instance_]');
    if (hs && hs.length) box = hs[hs.length - 1].querySelector('.' + CFG.ns + '-overlay');
    if (!box) box = document.querySelector('.' + CFG.ns + '-overlay');
    if (box) {
      box.innerHTML = '<div style="padding:16px;font:13px -apple-system,Arial,sans-serif;color:#b00020;">'
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
