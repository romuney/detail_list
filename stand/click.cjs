// Живой прогон вкладки на стенде борда: панель фильтров и список — каждый контрол кликом, с проверкой.
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
const applyText = (p) => p.F.evaluate(() => { const b = document.querySelector('[data-foot] [data-action="apply"]'); return b ? b.textContent.trim() : ''; });
// Прогноз панели по кубу: «Будет N» / «Под фильтрами N».
const forecast = (p) => p.F.evaluate(() => { const b = document.querySelector('[data-tot] b'); return b ? +b.textContent.replace(/\D/g, '') : -1; });
const PW = 340;
// Открыть фильтр панели: поле всегда на виду (разделы развёрнуты).
async function openFilter(p, key) {
  await p.F.click('[data-panel] [data-k="' + key + '"]');
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

    // Панель фильтров: разделы, в разделе — по два в ряд
    const pan = await p.F.evaluate(() => {
      const secs = document.querySelectorAll('[data-sec]'), flds = document.querySelectorAll('[data-panel] [data-k]'), out = { secs: secs.length, flds: flds.length, cols: 0 };
      const g = secs[0].querySelectorAll('[data-k]'), xs = {};
      g.forEach((b) => { xs[Math.round(b.getBoundingClientRect().left)] = 1; });
      out.cols = Object.keys(xs).length;
      return out;
    });
    ok(mode + ': панель — 7 разделов, 33 фильтра, по два в ряд', pan.secs === 7 && pan.flds === 33 && pan.cols === 2, pan);
    ok(mode + ': панель — iframe в ширину колонки', (await fltIframe(p)).w === PW, await fltIframe(p));

    // Структура: дерево уже в кубе — открыть без запроса; выпадашка справа от панели, поверх списка
    const tk = mode === 'kp' ? 'kp' : 'mu';
    const r0 = await reqs(p);
    await openFilter(p, tk);
    const dd1 = await ddOpen(p);
    const ddLeft = await p.F.evaluate(() => Math.round(document.querySelector('[class$="-dd"]').getBoundingClientRect().left));
    ok(mode + ': структура открывается без запроса', JSON.stringify(await reqs(p)) === JSON.stringify(r0) && (await p.F.$$('[data-tsel="' + tk + '"]')).length > 0);
    ok(mode + ': выпадашка широкая, справа от панели, поверх списка (маркер, iframe развёрнут вправо)',
      dd1 && dd1.w >= 500 && dd1.h > 150 && ddLeft >= PW && (await marker(p)) && (await fltIframe(p)).w > 800,
      [dd1, ddLeft, await marker(p), await fltIframe(p)]);
    await p.F.click('[class$="-dd"] [data-action="tw"]');
    await p.waitForTimeout(150);
    ok(mode + ': узел раскрывается', (await p.F.$$('[data-action="tw"][aria-expanded="true"]')).length > 0);
    await p.F.fill('[data-psearch]', 'инвест');
    await p.waitForTimeout(300);
    const hits = await p.F.$$('[data-tsel="' + tk + '"]');
    ok(mode + ': поиск юнита — по кубу, без запроса', hits.length > 0 && JSON.stringify(await reqs(p)) === JSON.stringify(r0), hits.length);
    ok(mode + ': курсор в поле поиска', await p.F.evaluate(() => document.activeElement && document.activeElement.hasAttribute('data-psearch')));
    const f0 = await forecast(p);
    await hits[0].click();
    await p.waitForTimeout(150);
    const f1 = await forecast(p);
    ok(mode + ': выбор копится — «Применить · 1»', /Применить · 1/.test(await applyText(p)), await applyText(p));
    ok(mode + ': прогноз «Будет N» — сразу по выбору, без запроса', f0 === all && f1 > 0 && f1 < f0 && JSON.stringify(await reqs(p)) === JSON.stringify(r0), [f0, f1, all]);
    await p.keyboard.press('Escape');
    await p.waitForTimeout(300);
    ok(mode + ': Esc закрывает, iframe обратно в колонку', !(await ddOpen(p)) && !(await marker(p)) && (await fltIframe(p)).w === PW, await fltIframe(p));
    ok(mode + ': поле показывает выбор и ×', (await p.F.$$('[data-k="' + tk + '"] [data-action="clr"]')).length === 1);

    // Каскад до «Применить»: счётчики значений другого фильтра — уже под набранным выбором
    await openFilter(p, 'f:emp_stream_desc');
    const before = await ddCounts(p);
    const sumB = Object.keys(before).reduce((x, k) => x + before[k], 0);
    ok(mode + ': значения атрибута — сразу, под набранной структурой (сумма = прогноз)', Object.keys(before).length > 0 && sumB === f1
      && JSON.stringify(await reqs(p)) === JSON.stringify(r0), [Object.keys(before).length, sumB, f1]);
    await p.keyboard.press('Escape');
    await openFilter(p, 'f:emp_specialization_it_code');
    await p.F.click('[class$="-dd"] [data-fk="emp_specialization_it_code"][data-fv="IT"]');
    await p.waitForTimeout(150);
    const f2 = await forecast(p);
    ok(mode + ': второй фильтр — «Применить · 2» в выпадашке и в панели, прогноз сузился', /Применить · 2/.test(await applyText(p))
      && /Применить · 2/.test(await p.F.textContent('[class$="-dd"] [data-action="apply"]')) && f2 < f1, [f2, f1]);
    await p.keyboard.press('Escape');
    await openFilter(p, 'f:emp_stream_desc');
    const midC = await ddCounts(p);
    const sumM = Object.keys(midC).reduce((x, k) => x + midC[k], 0);
    ok(mode + ': каскад — счётчики стрима пересчитались без запроса, пустые спрятаны', sumM === f2 && JSON.stringify(midC) !== JSON.stringify(before)
      && Object.keys(midC).every((k) => midC[k] > 0) && JSON.stringify(await reqs(p)) === JSON.stringify(r0), [sumM, f2]);
    const zb = await p.F.$('[class$="-dd"] [data-action="zeros"]');
    if (zb) {
      await zb.click();
      await p.waitForTimeout(150);
      ok(mode + ': «Показать ещё … без сотрудников» — нули серым', Object.keys(await ddCounts(p)).length > Object.keys(midC).length);
    }

    // Применить: оба чарта пересчитываются; список сразу показывает «Обновляю…»; итог = прогноз
    const lm = await listMasks(p);
    await act(p, ['flt', 'list'], async () => {
      await p.F.click('[class$="-dd"] [data-action="apply"]');
      await p.waitForTimeout(60);
      ok(mode + ': список сразу ждёт фильтры («Обновляю…»)', !!(await p.L.$('[class$="-load"]')));
    });
    const t1 = await total(p);
    ok(mode + ': «Применить» — итог списка = прогноз панели', t1 === f2 && t1 < all, [t1, f2, all]);
    ok(mode + ': список не эмитил сам', (await listMasks(p)) === lm);
    ok(mode + ': ожидание снято, выпадашка закрыта', !(await p.L.$('[class$="-load"]')) && !(await ddOpen(p)) && /^Применить$/.test(await applyText(p)), await applyText(p));
    ok(mode + ': применённые фильтры — в панели', (await p.F.$$('[data-panel] [data-action="clr"]')).length === 2 && (await forecast(p)) === t1);
    await openFilter(p, 'f:emp_stream_desc');
    const after = await ddCounts(p);
    const sumAfter = Object.keys(after).reduce((x, k) => x + after[k], 0);
    ok(mode + ': после «Применить» — те же счётчики при остальных фильтрах', sumAfter === t1, [sumAfter, t1]);
    await p.keyboard.press('Escape');
    // Подсказка у поля не разворачивает iframe (не дёргается)
    await p.F.hover('[data-panel] [data-k="f:office_desc"]');
    await p.waitForTimeout(250);
    const tp = await p.F.evaluate(() => { const t = document.querySelector('body > [class$="-tip"]'); if (!t || t.style.display === 'none') return null; const r = t.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.right)]; });
    ok(mode + ': подсказка поля — в панели, iframe не разворачивается', tp && tp[1] <= PW && !(await marker(p)) && (await fltIframe(p)).w === PW, [tp, await fltIframe(p)]);
    await p.mouse.move(900, 500);

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
    const copyAt = () => p.L.evaluate(() => { const r = document.querySelector('[data-action="copy"]').getBoundingClientRect(); return [Math.round(r.right), Math.round(r.top), Math.round(r.width)]; });
    const c0 = await copyAt();
    await p.L.click('[data-pop="group"]');
    await p.L.click('[data-grp="' + gcol + '"]');
    await p.waitForTimeout(250);
    ok(mode + ': группировка списком «+ колонка» — строки групп', (await p.L.$$('tr[data-action="grp"]')).length > 0);
    await p.keyboard.press('Escape');
    const gRows = () => p.L.evaluate(() => [document.querySelectorAll('[data-tbox] tr[data-action="grp"]').length, document.querySelectorAll('[data-tbox] tbody tr').length]);
    await p.L.click('[data-action="gall"]');
    await p.waitForTimeout(200);
    const gf = await gRows();
    ok(mode + ': общая каретка — все группы свёрнуты', gf[0] > 0 && gf[0] === gf[1] && /▸/.test(await p.L.textContent('[data-action="gall"]')), gf);
    await p.L.click('[data-action="gall"]');
    await p.waitForTimeout(200);
    const ge = await gRows();
    ok(mode + ': общая каретка — развёрнуты', ge[1] > ge[0] && /▾/.test(await p.L.textContent('[data-action="gall"]')), ge);
    await p.L.click('[data-gcol="' + gcol + '"] [data-action="gdel"]');
    await p.waitForTimeout(200);
    ok(mode + ': × на плашке — группировка снята', (await p.L.$$('tr[data-action="grp"]')).length === 0 && (await heads(p)).includes(gcol));
    // Перетащить заголовок в зону — группировка; плашку обратно на заголовки — снята, колонка на месте броска
    const m1 = await listMasks(p);
    await p.L.dragAndDrop('th[data-col="' + gcol + '"]', '[data-gzone]');
    await p.waitForTimeout(250);
    ok(mode + ': заголовок в зону группировки — группы, колонка ушла в плашку',
      (await p.L.$$('tr[data-action="grp"]')).length > 0 && !(await heads(p)).includes(gcol) && (await p.L.$$('[data-gcol="' + gcol + '"]')).length === 1 && (await listMasks(p)) === m1);
    const hs = await heads(p);
    await p.L.dragAndDrop('[data-gcol="' + gcol + '"]', 'th[data-col="' + hs[2] + '"]');
    await p.waitForTimeout(250);
    const hs2 = await heads(p);
    ok(mode + ': плашку на заголовок — группировка снята, колонка перед целью', (await p.L.$$('tr[data-action="grp"]')).length === 0 && hs2.indexOf(gcol) === hs2.indexOf(hs[2]) - 1, hs2.slice(0, 5));
    await p.L.fill('[data-tsearch]', 'а');
    await p.waitForTimeout(400);
    ok(mode + ': поиск по таблице', /найдено/.test(await p.L.textContent('[data-tcount]')));
    await p.L.fill('[data-tsearch]', '');
    await p.waitForTimeout(300);
    await p.L.click('[data-action="copy"]');
    await p.waitForTimeout(300);
    const cp = await p.L.evaluate(() => { const b = document.querySelector('[data-action="copy"]'); return [b.className, b.getAttribute('data-tip') || '', b.textContent]; });
    ok(mode + ': «Копировать» — иконкой, галочка и «Скопировано» в подсказке', /-ok/.test(cp[0]) && /Скопировано/.test(cp[1]) && cp[2].trim() === '', cp);
    ok(mode + ': «Копировать» — всегда справа, не сдвигается', JSON.stringify(await copyAt()) === JSON.stringify(c0), [c0, await copyAt()]);

    // Тур «Как работать»: все шаги до «Готово», стрелки, Esc
    await p.L.click('[data-tact="tour"]');
    await p.waitForTimeout(400);
    const tourSt = () => p.L.evaluate(() => {
      const c = document.querySelector('[class$="-tcard"]'), T = document.querySelector('body > [class$="-tour"]');
      if (!T || T.style.display !== 'block' || !c) return null;
      const r = c.getBoundingClientRect();
      return { h: c.querySelector('[class$="-tcs"]').textContent, btns: Array.prototype.map.call(c.querySelectorAll('[data-tact]'), (b) => b.getAttribute('data-tact')),
        inView: r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight && r.right <= innerWidth };
    });
    let steps = 0, allIn = true, n0 = '';
    for (let i = 0; i < 30; i++) {
      const st = await tourSt();
      if (!st) break;
      steps++;
      if (!n0) n0 = st.h;
      allIn = allIn && st.inView;
      if (st.btns.includes('demo')) { await p.L.click('[class$="-tcard"] [data-tact="demo"]'); await p.waitForTimeout(1800); }
      else if (st.btns.includes('next')) { await p.L.click('[class$="-tcard"] [data-tact="next"]'); await p.waitForTimeout(300); }
      else { await p.L.click('[class$="-tcard"] [class$="-pri"][data-tact="close"]'); await p.waitForTimeout(300); }
    }
    ok(mode + ': тур — все шаги до «Готово», карточка в окне', steps >= 8 && allIn && (await tourSt()) === null, [steps, n0, allIn]);
    await p.L.click('[data-tact="tour"]');
    await p.waitForTimeout(300);
    await p.keyboard.press('ArrowRight');
    await p.waitForTimeout(300);
    const ar = await tourSt();
    await p.keyboard.press('Escape');
    await p.waitForTimeout(200);
    ok(mode + ': тур — стрелка листает, Esc закрывает', !!ar && /· 2 из/.test(ar.h) && (await tourSt()) === null, ar);
    await p.L.click('[data-action="pg"][data-key="first"]').catch(() => {});

    // Лимит; «Сбросить» в строке фильтров — оба чарта снова на всех
    await p.L.click('[data-pop="lim"]');
    await act(p, ['list'], () => p.L.click('[data-action="setlim"][data-key="10000"]'));
    ok(mode + ': лимит 10 000', /10 000/.test(await p.L.textContent('[data-pop="lim"]')));
    await act(p, ['flt', 'list'], () => p.F.click('[data-foot] [data-action="reset"]'));
    ok(mode + ': «Сбросить» — снова все', (await total(p)) === all, [await total(p), all]);
    ok(mode + ': «Сбросить» — фильтров в панели нет', (await p.F.$$('[data-panel] [data-action="clr"]')).length === 0);
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
    await act(p, ['flt', 'list'], () => p.F.click('[data-foot] [data-action="reset"]'));
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
    ok(mode + ': клик мимо закрывает выпадашку, iframe обратно', !(await ddOpen(p)) && (await fltIframe(p)).w === PW && (await p.L.textContent('[data-pager]')) === pgBefore);

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
