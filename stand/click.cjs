// Живой прогон чарта на стенде: каждый контрол обоих чартов кликом, с проверкой результата.
// smoke скилла кликает первый поповер и первые подсказки; здесь — весь сценарий пользователя.
//
//   python3 stand/live.py &                                   # стенд поверх chdb
//   NODE_PATH=$(npm root -g) node stand/click.cjs [http://127.0.0.1:8766] [us|kp]
//
// Код выхода 0 — все шаги прошли; иначе список провалов. Ошибки консоли — провал шага.
const { chromium } = require('playwright');

const BASE = process.argv[2] || 'http://127.0.0.1:8766';
const MODES = process.argv[3] ? [process.argv[3]] : ['us', 'kp'];
const fails = [];
let passed = 0;

function ok(name, cond, detail) {
  if (cond) { passed++; console.log('  v ' + name); }
  else { fails.push(name + (detail !== undefined ? ' — ' + JSON.stringify(detail) : '')); console.log('  X ' + name + (detail !== undefined ? ' — ' + JSON.stringify(detail) : '')); }
}

async function page(browser, mode, user) {
  const p = await browser.newPage({ viewport: { width: 1500, height: 950 } });
  p.errs = [];
  p.on('pageerror', (e) => p.errs.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') p.errs.push(m.text()); });
  await p.goto(BASE + '/?user=' + user + '&mode=' + mode);
  await p.waitForFunction(() => window.__runs >= 1, null, { timeout: 60000 });
  await p.waitForTimeout(200);
  return p;
}
// Действие, после которого чарт шлёт кросс-фильтр: ждём ответ (перезапуск скрипта).
async function act(p, fn) {
  const runs = await p.evaluate(() => window.__runs);
  await fn();
  await p.waitForFunction((r) => window.__runs > r, runs, { timeout: 60000 });
  await p.waitForTimeout(250);
}
const total = (p) => p.evaluate(() => {
  const b = document.querySelector('[data-tcount] b');
  return b ? +b.textContent.replace(/\D/g, '') : -1;
});
const rowsShown = (p) => p.evaluate(() => document.querySelectorAll('[data-tbox] tbody tr').length);
const heads = (p) => p.evaluate(() => Array.prototype.map.call(document.querySelectorAll('[data-tbox] th'), (t) => t.getAttribute('data-col')));
const masks = (p) => p.evaluate(() => window.__masks.length);
const note = (p) => p.evaluate(() => { const n = document.querySelector('[data-tnote]'); return n ? n.textContent : ''; });
// Поповер фильтра полки — справа от полки и в окне.
const layerOk = (p) => p.evaluate(() => {
  const l = document.querySelector('[data-play]'), sh = document.querySelector('[data-shelf]');
  if (!l || !sh) return false;
  const r = l.getBoundingClientRect(), s = sh.getBoundingClientRect();
  return r.left >= s.right && r.top >= 0 && r.bottom <= window.innerHeight + 1 && r.width > 200;
});
const S = (sel) => sel;

(async () => {
  const browser = await chromium.launch();
  for (const mode of MODES) {
    console.log('— чарт ' + (mode === 'kp' ? '«Детальные списки КП»' : '«Детальные списки»'));
    const p = await page(browser, mode, 'hr.super');
    const all = await total(p);
    ok(mode + ': открытие — итог и две колонки', all > 0 && (await heads(p)).join(',') === 'master_id,hiredate', [all, await heads(p)]);
    ok(mode + ': на странице 100 сотрудников', (await rowsShown(p)) === 100, await rowsShown(p));
    const firstMask = await masks(p);
    ok(mode + ': открытие без эмитов', firstMask === 0, firstMask);
    ok(mode + ': больше 25 000 — плашка «сузьте фильтры»', all > 25000 && /Сузьте фильтры/.test(await note(p)), [all, await note(p)]);
    ok(mode + ': полка — все разделы нативных фильтров', (await p.$$('[data-shelf] [data-action="sfold"]')).length === 7 && (await p.$$('[data-shelf] [data-pop]')).length === 33,
      [(await p.$$('[data-shelf] [data-action="sfold"]')).length, (await p.$$('[data-shelf] [data-pop]')).length]);

    // Полка: свернуть и развернуть, раздел — свернуть и развернуть
    await p.click(S('[data-shelf] [data-action="shelf"]'));
    await p.waitForTimeout(120);
    const off = await p.evaluate(() => { const s = document.querySelector('[data-shelf]'); return s.getBoundingClientRect().width; });
    ok(mode + ': полка сворачивается', off < 60 && (await p.$$('[data-shelf] [data-pop]')).length === 0, off);
    await p.click(S('[data-shelf][data-action="shelf"]'));
    await p.waitForTimeout(120);
    ok(mode + ': полка разворачивается', (await p.$$('[data-shelf] [data-pop]')).length === 33);
    await p.click(S('[data-action="sfold"][data-key="1"]'));
    await p.waitForTimeout(100);
    const folded = (await p.$$('[data-shelf] [data-pop="mu"]')).length === 0;
    await p.click(S('[data-action="sfold"][data-key="1"]'));
    await p.waitForTimeout(100);
    ok(mode + ': раздел полки сворачивается и разворачивается', folded && (await p.$$('[data-shelf] [data-pop="mu"]')).length === 1);

    // Структура: дерево по запросу, раскрытие, поиск в датасете, выбор находки
    const tk = mode === 'kp' ? 'kp' : 'mu';
    await act(p, () => p.click(S('[data-shelf] [data-pop="' + tk + '"]')));
    ok(mode + ': структура загружена по открытию', (await p.$$('[data-tsel="' + tk + '"]')).length > 0);
    ok(mode + ': поповер фильтра — справа от полки, в окне', await layerOk(p));
    const mask1 = await p.evaluate(() => window.__masks[window.__masks.length - 1]);
    const cf = mode === 'kp' ? '_kf' : '_f';
    ok(mode + ': носители с суффиксом чарта', mask1.every((m) => m.column.slice(-cf.length) === cf) && mask1.some((m) => m.column === 'pt' + cf), mask1.map((m) => m.column));
    await p.click(S('[data-action="tw"]'));
    await p.waitForTimeout(150);
    ok(mode + ': узел раскрывается', (await p.$$('[data-action="tw"][aria-expanded="true"]')).length > 0);
    await act(p, async () => { await p.fill(S('[data-psearch="struct"]'), 'инвест'); });
    const hits = await p.$$('[data-tsel="' + tk + '"]');
    ok(mode + ': поиск юнита по всей структуре', hits.length > 0, hits.length);
    const focused = await p.evaluate(() => document.activeElement && document.activeElement.getAttribute('data-psearch'));
    ok(mode + ': курсор в поле поиска после ответа', focused === 'struct', focused);
    await hits[0].click();
    await p.waitForTimeout(150);
    ok(mode + ': выбор копится — «Применить · 1»', /Применить · 1/.test(await p.textContent(S('[data-action="apply"]'))));
    ok(mode + ': фильтр на полке показывает выбор', (await p.$$('[data-shelf] [data-scope="' + tk + '"] [data-action="chipx"]')).length === 1);
    await p.keyboard.press('Escape');

    // Атрибут: значения по открытию, выбор значения
    await act(p, () => p.click(S('[data-shelf] [data-pop="f:emp_specialization_it_code"]')));
    ok(mode + ': значения фильтров загружены по открытию', (await p.$$('[data-fk="emp_specialization_it_code"]')).length > 0);
    ok(mode + ': поповер атрибута — справа от полки, в окне', await layerOk(p));
    await p.click(S('[data-fk="emp_specialization_it_code"]'));
    await p.waitForTimeout(150);
    ok(mode + ': второй фильтр — «Применить · 2»', /Применить · 2/.test(await p.textContent(S('[data-action="apply"]'))));
    await p.keyboard.press('Escape');
    // Значения уже загружены — другой атрибут открывается без запроса
    const mf = await masks(p);
    await p.click(S('[data-shelf] [data-pop="f:emp_stream_desc"]'));
    await p.waitForTimeout(150);
    ok(mode + ': другой атрибут — без запроса', (await p.$$('[data-fk="emp_stream_desc"]')).length > 0 && (await masks(p)) === mf);
    await p.keyboard.press('Escape');

    // Применить: итог меньше, фильтры на полке, набранное снято
    await act(p, () => p.click(S('[data-action="apply"]')));
    const t1 = await total(p);
    ok(mode + ': «Применить» — итог сузился', t1 > 0 && t1 < all, [t1, all]);
    ok(mode + ': применённые фильтры — на полке', (await p.$$('[data-shelf] [data-action="chipx"]')).length === 2);
    ok(mode + ': кнопка снова «Применить» без счётчика', /^Применить$/.test((await p.textContent(S('[data-action="apply"]'))).trim()));

    // Колонки: все приходят сразу — пресет и снятие колонки без запроса
    const m0 = await masks(p);
    await p.click(S('[data-pop="cols"]'));
    await p.click(S('[data-action="preset"][data-key="' + (mode === 'kp' ? 2 : 0) + '"]'));
    await p.click(S('[data-action="colapply"]'));
    await p.waitForTimeout(300);
    const h1 = await heads(p);
    ok(mode + ': пресет колонок — без запроса', h1.length > 10 && (await masks(p)) === m0, [h1.length, await masks(p), m0]);
    await p.click(S('[data-pop="cols"]'));
    await p.click(S('[data-colk="full_nm"]'));
    await p.click(S('[data-action="colapply"]'));
    await p.waitForTimeout(300);
    const h2 = await heads(p);
    ok(mode + ': убрать колонку — без запроса', h2.length === h1.length - 1 && !h2.includes('full_nm') && (await masks(p)) === m0, [h2.length, h1.length]);

    // Сортировка: загружено всё → в памяти; иначе — на сервере
    const loadedAll = await p.evaluate(() => /первые/.test(document.querySelector('[data-tcount]').textContent) === false);
    const sortCol = mode === 'kp' ? 'kp2' : 'legal_position_nm';
    if (loadedAll || mode === 'kp') {
      await p.click(S('th[data-col="' + sortCol + '"]'));
      await p.waitForTimeout(300);
    } else {
      await act(p, () => p.click(S('th[data-col="' + sortCol + '"]')));
    }
    ok(mode + ': сортировка по колонке', (await p.$$('th[data-col="' + sortCol + '"] .' + (mode === 'kp' ? 'dlk' : 'dl') + '-sa')).length === 1);

    // Группировка, поиск по таблице, страницы, «Копировать»
    await p.click(S('[data-pop="group"]'));
    await p.click(S('[data-grp="' + (mode === 'kp' ? 'active_type_nm' : 'emp_stream_desc') + '"]'));
    await p.waitForTimeout(250);
    ok(mode + ': группировка — строки групп', (await p.$$('tr[data-action="grp"]')).length > 0);
    await p.keyboard.press('Escape');
    await p.click(S('[data-pop="group"]'));
    await p.click(S('[data-grp="' + (mode === 'kp' ? 'active_type_nm' : 'emp_stream_desc') + '"]'));
    await p.keyboard.press('Escape');
    await p.fill(S('[data-tsearch]'), 'а');
    await p.waitForTimeout(400);
    ok(mode + ': поиск по таблице', /найдено/.test(await p.textContent(S('[data-tcount]'))));
    const tsFocus = await p.evaluate(() => document.activeElement && document.activeElement.hasAttribute('data-tsearch'));
    ok(mode + ': курсор остаётся в поиске по таблице', tsFocus);
    await p.fill(S('[data-tsearch]'), '');
    await p.waitForTimeout(300);
    await p.click(S('[data-action="copy"]'));
    await p.waitForTimeout(300);
    ok(mode + ': «Копировать»', /Скопировано/.test(await p.textContent(S('[data-copytx]'))), await p.textContent(S('[data-copytx]')));

    // Лимит и сброс
    await p.click(S('[data-pop="lim"]'));
    await act(p, () => p.click(S('[data-action="setlim"][data-key="10000"]')));
    ok(mode + ': лимит 10 000', /10 000/.test(await p.textContent(S('[data-pop="lim"]'))));
    await act(p, () => p.click(S('[data-action="reset"]')));
    ok(mode + ': «Сбросить» — снова все', (await total(p)) === all, [await total(p), all]);
    const pg0 = await p.textContent(S('[data-pager]'));
    await p.click(S('[data-action="pg"][data-key="next"]'));
    await p.waitForTimeout(200);
    ok(mode + ': следующая страница', (await p.textContent(S('[data-pager]'))) !== pg0 && /101–200/.test(await p.textContent(S('[data-pager]'))));
    await p.click(S('[data-action="ps"][data-key="500"]'));
    await p.waitForTimeout(200);
    ok(mode + ': 500 строк на странице — с первой', /1–500/.test(await p.textContent(S('[data-pager]'))));

    // Сотрудники по списку
    await p.click(S('[data-shelf] [data-pop="ids"]'));
    await p.fill(S('[data-ids="rk"]'), '100001, 100002\n100003 abc');
    await p.waitForTimeout(150);
    ok(mode + ': список MasterID распознан', /В списке: 3/.test(await p.textContent(S('[data-idinfo]'))), await p.textContent(S('[data-idinfo]')));
    await p.keyboard.press('Escape');
    await act(p, () => p.click(S('[data-action="apply"]')));
    ok(mode + ': список сотрудников применён', (await total(p)) === 3, await total(p));
    ok(mode + ': все загружены — плашки нет', (await note(p)) === '', await note(p));

    // Под фильтрами от 5 000 до 25 000 — «Загрузить всех»: значение атрибута с таким числом
    await act(p, () => p.click(S('[data-action="reset"]')));
    // значения под этими фильтрами могли остаться в кэше — ждём сами значения, а не запрос
    await p.click(S('[data-shelf] [data-pop="f:active_type_nm"]'));
    await p.waitForFunction(() => document.querySelectorAll('[data-play] [data-fk]').length > 0, null, { timeout: 60000 });
    await p.waitForTimeout(250);
    const mid = await p.evaluate(() => {
      const ls = document.querySelectorAll('[data-play] label');
      for (let i = 0; i < ls.length; i++) {
        const n = +ls[i].textContent.replace(/^.*?(\d[\d\s\u2009\u00a0]*)$/, '$1').replace(/\D/g, '');
        if (n > 5000 && n <= 25000) return ls[i].querySelector('input').getAttribute('data-fv');
      }
      return null;
    });
    if (mid !== null) {
      await p.click(S('[data-fk="active_type_nm"][data-fv="' + mid + '"]'));
      await p.keyboard.press('Escape');
      await act(p, () => p.click(S('[data-action="apply"]')));
      const t2 = await total(p);
      ok(mode + ': до 25 000 — «Загрузить всех»', /Загрузить всех/.test(await note(p)), [t2, await note(p)]);
      await act(p, () => p.click(S('[data-tnote] [data-action="setlim"]')));
      const got = await p.evaluate(() => { const t = document.querySelector('[data-pager] .dl-pgi, [data-pager] .dlk-pgi'); return t ? t.textContent : ''; });
      ok(mode + ': «Загрузить всех» — загружены все', (await note(p)) === '' && new RegExp('из ' + t2.toLocaleString('ru-RU').replace(/\s/g, '.') + '$').test(got), [t2, got, await note(p)]);
    } else ok(mode + ': значение от 5 000 до 25 000 в мире', false, 'нет значения');

    ok(mode + ': ошибок в консоли нет', p.errs.length === 0, p.errs.slice(0, 3));
    await p.close();

    // Нет строки в warden — плашка, без таблицы
    const n = await page(browser, mode, 'nobody');
    ok(mode + ': без доступа — плашка', /warden/.test(await n.textContent('body')) && (await n.$$('[data-tbox]')).length === 0);
    await n.close();
  }
  await browser.close();
  console.log('\n' + (passed + fails.length) + ' шагов, провалов: ' + fails.length);
  fails.forEach((f) => console.log('  ✗ ' + f));
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
