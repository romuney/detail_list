// Живой прогон вкладки на стенде борда: строка фильтров и список — каждый контрол кликом, с проверкой.
// smoke скилла кликает первый поповер и первые подсказки одного чарта; здесь — весь сценарий пользователя
// на борде из двух iframe (области кросс-фильтров, канал скриншотов, CSS разворота — как в Proteus).
//
//   python3 stand/live.py &                                   # стенд поверх chdb
//   NODE_PATH=$(npm root -g) node stand/click.cjs [http://127.0.0.1:8766] [us|kp]
//
// Код выхода 0 — все шаги прошли; иначе список провалов. Ошибки консоли и скриптов чартов — провал шага.
const { chromium } = require('playwright');

const BASE = process.argv[2] || 'http://127.0.0.1:8766';
const MODES = process.argv[3] ? [process.argv[3]] : ['us', 'kp'];
const fails = [];
let passed = 0;

function ok(name, cond, detail) {
  if (cond) { passed++; console.log('  v ' + name); }
  else { fails.push(name + (detail !== undefined ? ' — ' + JSON.stringify(detail) : '')); console.log('  X ' + name + (detail !== undefined ? ' — ' + JSON.stringify(detail) : '')); }
}

async function open(browser, mode, user) {
  const p = await browser.newPage({ viewport: { width: 1500, height: 950 } });
  p.errs = [];
  p.on('pageerror', (e) => p.errs.push(e.message));
  // Песочница iframe без clipboard-write: браузер пишет о блокировке Clipboard API, чарт копирует запасным
  // путём (execCommand) — так же в Proteus; это не ошибка чарта.
  p.on('console', (m) => { if (m.type() === 'error' && !/Clipboard API has been blocked/.test(m.text())) p.errs.push(m.text()); });
  await p.goto(BASE + '/?user=' + user + '&mode=' + mode);
  await p.waitForFunction(() => window.__runs && window.__runs.flt >= 1 && window.__runs.list >= 1, null, { timeout: 90000 });
  await p.waitForTimeout(300);
  p.F = p.frame({ name: 'flt' });
  p.L = p.frame({ name: 'list' });
  return p;
}
const runs = (p) => p.evaluate(() => ({ flt: window.__runs.flt, list: window.__runs.list }));
const reqs = (p) => p.evaluate(() => ({ flt: window.__req.flt, list: window.__req.list }));
// Действие, после которого перезапускаются указанные чарты (ждём ответ каждого).
async function act(p, which, fn) {
  const r0 = await runs(p);
  await fn();
  await p.waitForFunction((a) => a.w.every((c) => window.__runs[c] > a.r[c]), { w: which, r: r0 }, { timeout: 90000 });
  await p.waitForTimeout(300);
}
const total = (p) => p.L.evaluate(() => { const b = document.querySelector('[data-tcount] b'); return b ? +b.textContent.replace(/\D/g, '') : -1; });
const rowsShown = (p) => p.L.evaluate(() => document.querySelectorAll('[data-tbox] tbody tr').length);
const heads = (p) => p.L.evaluate(() => Array.prototype.map.call(document.querySelectorAll('[data-tbox] th'), (t) => t.getAttribute('data-col')));
const note = (p) => p.L.evaluate(() => { const n = document.querySelector('[data-tnote]'); return n ? n.textContent : ''; });
const listMasks = (p) => p.evaluate(() => window.__masks.list.length);
const fltIframe = (p) => p.evaluate(() => { const f = document.querySelector('iframe[name="flt"]').getBoundingClientRect(); return { h: Math.round(f.height), w: Math.round(f.width) }; });
const marker = (p) => p.evaluate(() => /REwtRkxULURELU9O/.test(document.querySelector('.dashboard-chart-id-222222 img.echarts-plugin, .dashboard-chart-id-333333 img.echarts-plugin').src || ''));
const ddOpen = (p) => p.F.evaluate(() => { const d = document.querySelector('[class$="-dd"]'); if (!d || d.style.display === 'none') return null; const r = d.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top) }; });
const applyText = (p) => p.F.evaluate(() => { const b = document.querySelector('[data-acts] [data-action="apply"]'); return b ? b.textContent.trim() : ''; });
// Открыть фильтр строки: пилюля видна — по ней, спрятана в «Ещё» — через «Ещё».
async function openFilter(p, key) {
  const vis = await p.F.evaluate((k) => { const b = document.querySelector('[data-pills] [data-k="' + k + '"]'); return !!b && b.style.display !== 'none'; }, key);
  if (vis) await p.F.click('[data-pills] [data-k="' + key + '"]');
  else {
    await p.F.click('[data-more]');
    await p.waitForTimeout(150);
    await p.F.click('[class$="-dd"] [data-pop="' + key + '"]');
  }
  await p.waitForTimeout(250);
}
// Счётчики значений атрибута в открытой выпадашке: значение → число.
const ddCounts = (p) => p.F.evaluate(() => {
  const o = {};
  document.querySelectorAll('[class$="-dd"] label').forEach((l) => {
    const i = l.querySelector('input'), n = l.querySelector('[class$="-optn"]');
    if (i && n) o[i.getAttribute('data-fv')] = +n.textContent.replace(/\D/g, '');
  });
  return o;
});

(async () => {
  const browser = await chromium.launch();
  for (const mode of MODES) {
    console.log('— вкладка ' + (mode === 'kp' ? '«Детальные списки КП»' : '«Детальные списки»'));
    const p = await open(browser, mode, 'hr.super');
    const all = await total(p);
    ok(mode + ': открытие — итог и две колонки', all > 0 && (await heads(p)).join(',') === 'master_id,hiredate', [all, await heads(p)]);
    ok(mode + ': на странице 100 сотрудников', (await rowsShown(p)) === 100, await rowsShown(p));
    ok(mode + ': открытие без эмитов', (await p.evaluate(() => window.__masks.flt.length + window.__masks.list.length)) === 0);
    ok(mode + ': больше 25 000 — плашка «сузьте фильтры»', all > 25000 && /Сузьте фильтры/.test(await note(p)), [all, await note(p)]);

    // Строка фильтров: два ряда, всё остальное — в «Ещё»
    const bar = await p.F.evaluate(() => {
      const ps = Array.prototype.slice.call(document.querySelectorAll('[data-pills] [data-k]'));
      const vis = ps.filter((b) => b.style.display !== 'none'), more = document.querySelector('[data-more]');
      const tops = {};
      vis.forEach((b) => { tops[b.getBoundingClientRect().top] = 1; });
      return { all: ps.length, vis: vis.length, rows: Object.keys(tops).length, more: more && more.style.display !== 'none' ? more.textContent : '' };
    });
    ok(mode + ': строка — 33 фильтра, видимые в два ряда, остальные в «Ещё»', bar.all === 33 && bar.rows <= 2 && (bar.vis === 33 || /Ещё \d+/.test(bar.more)), bar);
    ok(mode + ': строка — iframe в высоту ячейки', (await fltIframe(p)).h === 96, await fltIframe(p));

    // Структура: значения уже в ответе — открыть без запроса; выпадашка широкая, iframe развернулся
    const tk = mode === 'kp' ? 'kp' : 'mu';
    const r0 = await reqs(p);
    await openFilter(p, tk);
    const dd1 = await ddOpen(p);
    ok(mode + ': структура открывается без запроса', JSON.stringify(await reqs(p)) === JSON.stringify(r0) && (await p.F.$$('[data-tsel="' + tk + '"]')).length > 0);
    ok(mode + ': выпадашка широкая и поверх списка (маркер, iframe развёрнут)', dd1 && dd1.w >= 500 && dd1.h > 150 && (await marker(p)) && (await fltIframe(p)).h > 500,
      [dd1, await marker(p), await fltIframe(p)]);
    await p.F.click('[class$="-dd"] [data-action="tw"]');
    await p.waitForTimeout(150);
    ok(mode + ': узел раскрывается', (await p.F.$$('[data-action="tw"][aria-expanded="true"]')).length > 0);
    await p.F.fill('[data-psearch]', 'инвест');
    await p.waitForTimeout(300);
    const hits = await p.F.$$('[data-tsel="' + tk + '"]');
    ok(mode + ': поиск юнита — по пришедшему дереву, без запроса', hits.length > 0 && JSON.stringify(await reqs(p)) === JSON.stringify(r0), hits.length);
    ok(mode + ': курсор в поле поиска', await p.F.evaluate(() => document.activeElement && document.activeElement.hasAttribute('data-psearch')));
    await hits[0].click();
    await p.waitForTimeout(150);
    ok(mode + ': выбор копится — «Применить · 1»', /Применить · 1/.test(await applyText(p)), await applyText(p));
    await p.keyboard.press('Escape');
    await p.waitForTimeout(300);
    ok(mode + ': Esc закрывает, iframe обратно в строку', !(await ddOpen(p)) && !(await marker(p)) && (await fltIframe(p)).h === 96, await fltIframe(p));
    ok(mode + ': фильтр на строке показывает выбор', (await p.F.$$('[data-k="' + tk + '"] [data-action="clr"]')).length === 1);

    // Атрибут: значения со счётчиками, выбор
    await openFilter(p, 'f:emp_stream_desc');
    const before = await ddCounts(p);
    ok(mode + ': значения атрибута — сразу, со счётчиками', Object.keys(before).length > 5 && JSON.stringify(await reqs(p)) === JSON.stringify(r0), Object.keys(before).length);
    await p.keyboard.press('Escape');
    await openFilter(p, 'f:emp_specialization_it_code');
    await p.F.click('[class$="-dd"] [data-fk="emp_specialization_it_code"][data-fv="IT"]');
    await p.waitForTimeout(150);
    ok(mode + ': второй фильтр — «Применить · 2» в выпадашке и в строке', /Применить · 2/.test(await applyText(p))
      && /Применить · 2/.test(await p.F.textContent('[class$="-dd"] [data-action="apply"]')));

    // Применить: оба чарта пересчитываются; список сразу показывает «Обновляю…»
    const lm = await listMasks(p);
    await act(p, ['flt', 'list'], async () => {
      await p.F.click('[class$="-dd"] [data-action="apply"]');
      await p.waitForTimeout(60);
      ok(mode + ': список сразу ждёт фильтры («Обновляю…»)', !!(await p.L.$('[class$="-load"]')));
    });
    const t1 = await total(p);
    ok(mode + ': «Применить» — итог списка сузился', t1 > 0 && t1 < all, [t1, all]);
    ok(mode + ': список не эмитил сам', (await listMasks(p)) === lm);
    ok(mode + ': ожидание снято, выпадашка закрыта', !(await p.L.$('[class$="-load"]')) && !(await ddOpen(p)) && /^Применить$/.test(await applyText(p)), await applyText(p));
    ok(mode + ': применённые фильтры — на строке', (await p.F.$$('[data-pills] [data-action="clr"]')).length === 2);
    await openFilter(p, 'f:emp_stream_desc');
    const after = await ddCounts(p);
    const sumAfter = Object.keys(after).reduce((s, k) => s + after[k], 0);
    ok(mode + ': влияние фильтра на фильтр — счётчики стрима при остальных фильтрах', JSON.stringify(after) !== JSON.stringify(before) && sumAfter === t1, [sumAfter, t1]);
    await p.keyboard.press('Escape');

    // Колонки: добавить — один запрос списка; убрать — без запроса
    const lr = await reqs(p);
    await act(p, ['list'], async () => {
      await p.L.click('[data-pop="cols"]');
      await p.L.click('[data-action="preset"][data-key="' + (mode === 'kp' ? 2 : 0) + '"]');
      await p.L.click('[data-action="colapply"]');
    });
    const h1 = await heads(p);
    ok(mode + ': пресет колонок — один запрос списка, строку фильтров не трогает', h1.length > 10 && (await reqs(p)).flt === lr.flt, [h1.length, await reqs(p), lr]);
    const m0 = await listMasks(p);
    await p.L.click('[data-pop="cols"]');
    await p.L.click('[data-colk="full_nm"]');
    await p.L.click('[data-action="colapply"]');
    await p.waitForTimeout(300);
    const h2 = await heads(p);
    ok(mode + ': убрать колонку — без запроса', h2.length === h1.length - 1 && !h2.includes('full_nm') && (await listMasks(p)) === m0, [h2.length, h1.length]);

    // Сортировка, группировка, поиск по таблице, «Копировать»
    const loadedAll = await p.L.evaluate(() => /первые/.test(document.querySelector('[data-tcount]').textContent) === false);
    const sortCol = mode === 'kp' ? 'kp2' : 'legal_position_nm';
    if (loadedAll || mode === 'kp') { await p.L.click('th[data-col="' + sortCol + '"]'); await p.waitForTimeout(300); }
    else await act(p, ['list'], () => p.L.click('th[data-col="' + sortCol + '"]'));
    ok(mode + ': сортировка по колонке', (await p.L.$$('th[data-col="' + sortCol + '"] [class$="-sa"]')).length === 1);
    const gcol = mode === 'kp' ? 'active_type_nm' : 'emp_stream_desc';
    await p.L.click('[data-pop="group"]');
    await p.L.click('[data-grp="' + gcol + '"]');
    await p.waitForTimeout(250);
    ok(mode + ': группировка — строки групп', (await p.L.$$('tr[data-action="grp"]')).length > 0);
    await p.keyboard.press('Escape');
    await p.L.click('[data-pop="group"]');
    await p.L.click('[data-grp="' + gcol + '"]');
    await p.keyboard.press('Escape');
    await p.L.fill('[data-tsearch]', 'а');
    await p.waitForTimeout(400);
    ok(mode + ': поиск по таблице', /найдено/.test(await p.L.textContent('[data-tcount]')));
    await p.L.fill('[data-tsearch]', '');
    await p.waitForTimeout(300);
    await p.L.click('[data-action="copy"]');
    await p.waitForTimeout(300);
    ok(mode + ': «Копировать»', /Скопировано/.test(await p.L.textContent('[data-copytx]')), await p.L.textContent('[data-copytx]'));

    // Лимит; «Сбросить» в строке фильтров — оба чарта снова на всех
    await p.L.click('[data-pop="lim"]');
    await act(p, ['list'], () => p.L.click('[data-action="setlim"][data-key="10000"]'));
    ok(mode + ': лимит 10 000', /10 000/.test(await p.L.textContent('[data-pop="lim"]')));
    await act(p, ['flt', 'list'], () => p.F.click('[data-acts] [data-action="reset"]'));
    ok(mode + ': «Сбросить» — снова все', (await total(p)) === all, [await total(p), all]);
    ok(mode + ': «Сбросить» — фильтров на строке нет', (await p.F.$$('[data-pills] [data-action="clr"]')).length === 0);
    const pg0 = await p.L.textContent('[data-pager]');
    await p.L.click('[data-action="pg"][data-key="next"]');
    await p.waitForTimeout(200);
    ok(mode + ': следующая страница', (await p.L.textContent('[data-pager]')) !== pg0 && /101–200/.test(await p.L.textContent('[data-pager]')));

    // Сотрудники по списку
    await openFilter(p, 'ids');
    await p.F.fill('[data-ids="rk"]', '100001, 100002\n100003 abc');
    await p.waitForTimeout(150);
    ok(mode + ': список MasterID распознан', /В списке: 3/.test(await p.F.textContent('[data-idinfo]')), await p.F.textContent('[data-idinfo]'));
    await act(p, ['flt', 'list'], () => p.F.click('[class$="-dd"] [data-action="apply"]'));
    ok(mode + ': список сотрудников применён', (await total(p)) === 3, await total(p));
    ok(mode + ': все загружены — плашки нет', (await note(p)) === '', await note(p));

    // Под фильтрами от 5 000 до 25 000 — «Загрузить всех»
    await act(p, ['flt', 'list'], () => p.F.click('[data-acts] [data-action="reset"]'));
    await openFilter(p, 'f:active_type_nm');
    const mid = await p.F.evaluate(() => {
      const ls = document.querySelectorAll('[class$="-dd"] label[class$="-opt"]');
      for (let i = 0; i < ls.length; i++) {
        const n = +ls[i].querySelector('[class$="-optn"]').textContent.replace(/\D/g, '');
        if (n > 5000 && n <= 25000) return ls[i].querySelector('input').getAttribute('data-fv');
      }
      return null;
    });
    if (mid !== null) {
      await p.F.click('[class$="-dd"] [data-fk="active_type_nm"][data-fv="' + mid + '"]');
      await act(p, ['flt', 'list'], () => p.F.click('[class$="-dd"] [data-action="apply"]'));
      const t2 = await total(p);
      ok(mode + ': до 25 000 — «Загрузить всех»', /Загрузить всех/.test(await note(p)), [t2, await note(p)]);
      await act(p, ['list'], () => p.L.click('[data-tnote] [data-action="setlim"]'));
      const got = await p.L.evaluate(() => { const t = document.querySelector('[data-pager] [class$="-pgi"]'); return t ? t.textContent : ''; });
      ok(mode + ': «Загрузить всех» — загружены все', (await note(p)) === '' && new RegExp('из ' + t2.toLocaleString('ru-RU').replace(/\s/g, '.') + '$').test(got), [t2, got]);
    } else ok(mode + ': значение от 5 000 до 25 000 в мире', false, 'нет значения');

    // Клик мимо выпадашки (по списку под развёрнутым слоем) — закрывает её, список не кликается
    await openFilter(p, 'emp');
    const pgBefore = await p.L.textContent('[data-pager]');
    await p.mouse.click(700, 600);
    await p.waitForTimeout(300);
    ok(mode + ': клик мимо закрывает выпадашку, iframe обратно', !(await ddOpen(p)) && (await fltIframe(p)).h === 96 && (await p.L.textContent('[data-pager]')) === pgBefore);

    const errs = p.errs.concat(await p.evaluate(() => window.__errs));
    ok(mode + ': ошибок в консоли и в скриптах чартов нет', errs.length === 0, errs.slice(0, 3));
    await p.close();

    // Нет строки в warden — плашки в обоих чартах
    const n = await open(browser, mode, 'nobody');
    ok(mode + ': без доступа — плашки, без таблицы', /warden/.test(await n.L.textContent('body')) && /warden/.test(await n.F.textContent('body'))
      && (await n.L.$$('[data-tbox]')).length === 0);
    await n.close();
  }
  await browser.close();
  console.log('\n' + (passed + fails.length) + ' шагов, провалов: ' + fails.length);
  fails.forEach((f) => console.log('  ✗ ' + f));
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
