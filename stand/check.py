"""Проверки датасета «Детальных списков» на стенде (chdb = ClickHouse 24.8).

    python3 stand/world.py              # мир один раз (stand/.db)
    python3 stand/check.py [us|kp]      # проверки обоих режимов (или одного)

1. Оракул — прежний датасет из выгрузки (mdm_employee_d_detail_echarts / …functional_echarts),
   запущенный как есть: при тех же фильтрах новый отдаёт тех же сотрудников и те же значения
   всех полей, включая маски warden (у нового скрытое — '⛔' вместо текста). Пользователи —
   частичный доступ, всё, лидер профессии, правило логина из CROSS-8440; фильтры — атрибуты,
   узлы УС / ЮС (по справочнику старого кросс-фильтра), уровни КП, региональный HR, ТЦР,
   численность, пользовательская дата, списки MasterID и логинов.
2. Независимый расчёт (SQL, собранный здесь, не Jinja датасета): куб панели фильтров — словари, коды
   сотрудников, деревья целиком; счётчики «при остальных фильтрах», посчитанные по кубу так же, как их
   считает чарт (ch.cube_count), = счёт SQL по источнику; итог по кубу = итог датасета списка.
3. Части ответа (по умолчанию — только meta и строки), все поля реестра в строках, сортировка,
   лимит, пачки, эхо, строка на аллокацию у КП, носители другого чарта не действуют, враждебный ввод,
   AlwaysTrue при сохранении датасета, нет строки в warden, режимы ClickHouse 24.8 (старый
   анализатор, prefer_column_name_to_alias, join_use_nulls, group_by_use_nulls).
4. Круг sqlglot: Proteus (Superset 4.1+) разбирает SQL sqlglot и может перепечатать его им же —
   перепечатанный запрос отдаёт тот же ответ (разбор при сохранении — stand/parse.py).
"""
import os
import re
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ch  # noqa: E402

MASK_OLD = '⛔️ Нет доступа к данным'
MASK_NEW = '⛔'
ALL_PARTS = ['r', 'f', 'mu', 'lu', 'kp']
FAILS = []
PASSED = [0]
TREES = {}   # (режим, дерево, с фильтрами) → (фильтры, ожидаемые узлы) — из независимого расчёта


def ok(name, cond, detail=''):
    if cond:
        PASSED[0] += 1
    else:
        FAILS.append(name + (' — ' + str(detail)[:600] if detail else ''))
        print('  FAIL', name, str(detail)[:600])


def q(sql):
    rows, _ = ch._run(sql)
    return rows


def lit(v):
    return "'" + str(v).replace('\\', '\\\\').replace("'", "\\'") + "'"


# ---------- реестр ключей и порядок полей прежнего датасета ----------
SRC = open(ch.DATASET, encoding='utf-8').read()


def jinja_list(name):
    m = re.search(r"\{% set " + name + r" = \[(.*?)\]", SRC, re.S)
    return re.findall(r"'([a-z0-9_]+)'", m.group(1))


EMP_KEYS = jinja_list('EMP_KEYS')
ALLOC_KEYS = ['alloc'] + ['kp%d' % i for i in range(1, 13)]
FACETS = jinja_list('FACETS')
KEY2COL = {'master_id': 'mdm_employee_rk', 'hiredate': 'company_hire_dt', 'my_link': 'employee_link', 'alloc': 'allocation_prt_norm'}
KEY2COL.update({'kp%d' % i: 'lvl%d_functional_unit_nm' % i for i in range(1, 13)})


def old_order(mode):
    """Порядок полей в packed_b64 прежнего датасета: имена колонок из массива упаковки."""
    import yaml
    sql = yaml.safe_load(open(ch.ORACLE[mode], encoding='utf-8'))['sql']
    arr = sql[sql.index('arrayMap('):sql.index('AS packed_b64')]
    return [m.group(1) or m.group(2) for m in re.finditer(r"ifNull\(toString\((?:`(\w+)`|(toYear\(toDate\(now\(\)\)\)))\),''\)", arr)]


def keys_for(mode):
    return EMP_KEYS + (ALLOC_KEYS if mode == 'kp' else [])


def run_new(flt, user, mode, cols=None, settings='', reprinted=False, view='list'):
    f = dict(flt)
    if cols is not None:
        f['cols_f'] = cols
    rows, dt = ch.dataset(f, user, mode, settings=settings, reprinted=reprinted, view=view)
    return ch.decode(rows), rows, dt


# ---------- 1. оракул ----------
def compare(name, old_flt, new_flt, user, mode, order):
    try:
        old, _, _ = ch.current(old_flt, user, mode, limit=10 ** 7)
    except Exception as e:  # noqa: BLE001
        ok(name + ': прежний датасет упал', False, e)
        return
    keys = keys_for(mode)
    nf = dict(new_flt)
    nf['lim_f'] = ['25000']
    d, rows, _ = run_new(nf, user, mode, keys)
    m = d['meta']['m']
    ok(name + ': всего сотрудников', int(m['total']) == len(old), (m['total'], len(old)))
    idx = {c: i for i, c in enumerate(d['cols'])}
    ok(name + ': все поля реестра', d['cols'] == keys, d['cols'][:5])
    new_by = {}
    for r in d['rows']:
        new_by.setdefault(int(r[idx['master_id']]), []).append(r)
    if mode == 'kp':
        # У КП поля сотрудника (кроме MasterID) — только в первой строке блока; чарт берёт их оттуда.
        emp_i = [idx[k] for k in keys if k not in ALLOC_KEYS and k != 'master_id']
        extra = 0
        for rs in new_by.values():
            for r in rs[1:]:
                extra += any(r[i] != '' for i in emp_i)
                for i in emp_i:
                    r[i] = rs[0][i]
        ok(name + ': поля сотрудника — только в первой строке блока', extra == 0, extra)
    expect_ids = sorted(old)[:25000]
    ok(name + ': те же сотрудники (первые 25 000 по MasterID)', sorted(new_by) == expect_ids,
       (len(new_by), len(expect_ids), sorted(set(new_by) ^ set(expect_ids))[:5]))
    pos = {c: i for i, c in enumerate(order)}
    bad = []
    for rk in expect_ids:
        if rk not in new_by:
            continue
        olds = []
        for a in old[rk]:
            vals = []
            for k in keys:
                col = KEY2COL.get(k, k)
                vals.append(a[pos[col]] if col in pos else None)
            olds.append(vals)
        news = []
        for r in new_by[rk]:
            vals = []
            for k in keys:
                col = KEY2COL.get(k, k)
                v = r[idx[k]]
                vals.append((MASK_OLD if v == MASK_NEW else v) if col in pos else None)
            news.append(vals)
        if sorted(olds) != sorted(news):
            diff = [(keys[i], o, n) for o_, n_ in zip(sorted(olds), sorted(news)) for i, (o, n) in enumerate(zip(o_, n_)) if o != n]
            bad.append((rk, diff[:4] or (len(olds), len(news))))
        if len(bad) > 5:
            break
    ok(name + ': значения всех полей и маски — как в прежнем', not bad, bad)
    return d


def oracle(mode):
    print('— оракул: прежний датасет, режим %s' % mode)
    order = old_order(mode)
    missing = [KEY2COL.get(k, k) for k in keys_for(mode) if KEY2COL.get(k, k) not in order and k != 'my_link']
    ok('%s: все поля прежней упаковки есть в реестре' % mode, not missing, missing)
    stream = q("SELECT emp_stream_desc AS v FROM prod_proteus.mdm_employee_d_detail_last_day GROUP BY v ORDER BY count() DESC LIMIT 1 OFFSET 3")[0]['v']
    mu = q("SELECT new_management_unit_nm AS nm, management_unit_rk AS rk FROM prod_proteus.cross_filter_management_structure "
           "WHERE management_unit_level_num = 5 AND new_management_unit_nm = management_unit_nm ORDER BY rk LIMIT 1")[0]
    mu_dup = q("SELECT new_management_unit_nm AS nm, management_unit_rk AS rk FROM prod_proteus.cross_filter_management_structure "
               "WHERE new_management_unit_nm != management_unit_nm ORDER BY rk LIMIT 1")[0]
    lu = q("SELECT new_legal_unit_nm AS nm, legal_unit_rk AS rk FROM prod_proteus.cross_filter_legal_structure "
           "WHERE legal_unit_level_num = 3 AND new_legal_unit_nm = legal_unit_nm ORDER BY rk LIMIT 1")[0]
    kp = q("SELECT lvl1_functional_unit_nm AS a, lvl2_functional_unit_nm AS b, lvl3_functional_unit_nm AS c "
           "FROM prod_proteus.mdm_employee_d_detail_last_day_functional WHERE c IS NOT NULL GROUP BY a, b, c ORDER BY count() DESC LIMIT 1")[0]
    ids = [r['id'] for r in q("SELECT mdm_employee_rk AS id FROM prod_proteus.mdm_employee_d_detail_last_day WHERE mdm_employee_rk % 997 = 0 ORDER BY id")]
    logins = [r['l'] for r in q("SELECT ad_login AS l FROM prod_proteus.mdm_employee_d_detail_last_day WHERE mdm_employee_rk % 1499 = 0 ORDER BY l")]
    d0_ms = int(time.mktime(time.strptime('2026-08-31 03:00:00', '%Y-%m-%d %H:%M:%S')) * 1000)
    base_old = {'calendar_date': ['Последний день'], 'employee_type': ['Юридическая']}
    S = [
        ('по умолчанию, частичный доступ', {}, {}, 'a.user'),
        ('по умолчанию, суперпользователь', {}, {}, 'hr.super'),
        ('по умолчанию, лидер профессии', {}, {}, 'p.lead'),
        ('правило логина CROSS-8440', {}, {}, 'an.a.sokolova'),
        ('IT + стрим', {'emp_specialization_it_code': ['IT'], 'emp_stream_desc': [stream]},
         {'flt_f': ['emp_specialization_it_code=IT', 'emp_stream_desc=' + stream]}, 'a.user'),
        ('флаг руководителя', {'management_head_flg': ['1']}, {'flt_f': ['management_head_flg=1']}, 'a.user'),
        ('региональный HR + пустой', {'regional_hr_login': ['rhr.user5', '-']},
         {'flt_f': ['regional_hr_login=rhr.user5', 'regional_hr_login=-']}, 'a.user'),
        ('юнит УС 5-го уровня', {'new_management_unit_nm': [mu['nm']]}, {'mu_f': [mu['rk']]}, 'a.user'),
        ('юнит УС с неуникальным именем', {'new_management_unit_nm': [mu_dup['nm']]}, {'mu_f': [mu_dup['rk']]}, 'hr.super'),
        ('юнит ЮС 3-го уровня', {'new_legal_unit_nm': [lu['nm']]}, {'lu_f': [lu['rk']]}, 'a.user'),
        ('уровни КП 1–3', {'lvl1_functional_unit_nm': [kp['a']], 'lvl2_functional_unit_nm': [kp['b']], 'lvl3_functional_unit_nm': [kp['c']]},
         {'kp_f': ['\x1f'.join([kp['a'], kp['b'], kp['c']])]}, 'a.user'),
        ('численность «Активная»', {'employee_type': ['Активная']}, {'emp_f': ['Активная']}, 'a.user'),
        ('ТЦР РФ', {'tcr_type': ['ТЦР РФ']}, {'tcr_f': ['ТЦР РФ']}, 'a.user'),
        ('пользовательская дата', {'calendar_date': ['Пользовательская дата'], 'business_dt_detail': [d0_ms]},
         {'per_f': ['date'], 'dt_f': ['2026-08-31']}, 'hr.super'),
        ('список MasterID', {'mdm_employee_rk': ids}, {'id_f': ['rk=%d' % i for i in ids]}, 'a.user'),
        ('список логинов', {'ad_login': logins}, {'id_f': ['login=' + x.upper() for x in logins]}, 'a.user'),
        ('всё вместе', {'emp_specialization_it_code': ['IT'], 'new_management_unit_nm': [mu['nm']], 'regional_hr_login': ['-']},
         {'flt_f': ['emp_specialization_it_code=IT', 'regional_hr_login=-'], 'mu_f': [mu['rk']]}, 'hr.super'),
    ]
    for name, of, nf, user in S:
        old_flt = dict(base_old)
        old_flt.update(of)
        compare('%s %s' % (mode, name), old_flt, nf, user, mode, order)
    return stream, mu, lu, kp


# ---------- 2. независимый расчёт ----------
def where_indep(flt, skip=''):
    """Условия фильтров для проверки — независимо от Jinja датасета: по массивам-путям источника."""
    parts = []
    F = {}
    for s in flt.get('flt_f', []):
        a, x = s.split('=', 1)
        F.setdefault(a, []).append(x)
    for a, vals in F.items():
        if a == skip:
            continue
        if a == 'regional_hr_login':
            real = [v for v in vals if v != '-']
            c = []
            if real:
                c.append('hasAny([%s], login_reg_hr_list)' % ', '.join(lit(v) for v in real))
            if '-' in vals:
                c.append('length(login_reg_hr_list) = 0')
            parts.append('(' + ' OR '.join(c) + ')')
        else:
            parts.append("ifNull(toString(%s), '') IN (%s)" % (a, ', '.join(lit(v) for v in vals)))
    if flt.get('mu_f') and skip != 'mu':
        parts.append('hasAny([%s], mapped_management_unit_rk_list)' % ', '.join(lit(v) for v in flt['mu_f']))
    if flt.get('lu_f') and skip != 'lu':
        parts.append('hasAny([%s], legal_unit_rk_list)' % ', '.join(lit(v) for v in flt['lu_f']))
    if flt.get('kp_f') and skip != 'kp':
        # путь аллокации — уровни без пустых и '-'; узел — префикс пути
        parts.append("arrayExists(a -> arrayExists(s -> startsWith(concat(arrayStringConcat(arrayFilter(y -> y != '' AND y != '-', "
                     "arraySlice(splitByString('<>', a), 1, 12)), char(31)), char(31)), concat(s, char(31))), [%s]), "
                     "splitByString(';', ifNull(functional_lvl_all_array, '')))" % ', '.join(lit(v) for v in flt['kp_f']))
    emp = (flt.get('emp_f') or ['Юридическая'])[0]
    if skip != 'emp':
        parts.append('%s = 1' % ('active_employee_flg' if emp == 'Активная' else 'legal_employee_flg'))
    tcr = (flt.get('tcr_f') or [''])[0]
    if tcr and skip != 'tcr':
        parts.append('%s = 1' % {'ТЦР РФ': 'rus_tcr_flg', 'ТЦР СНГ': 'foreign_tcr_flg', 'ТЦР РФ + ТЦР СНГ': 'tcr_flg'}[tcr])
    return ' AND '.join(parts) or '1'


def sel_of(flt):
    """Носители → выбор чарта (как его держит state.stage)."""
    F = {}
    for x in flt.get('flt_f', []):
        a, v = x.split('=', 1)
        F.setdefault(a, []).append(v)
    return {'flt': F, 'mu': flt.get('mu_f', []), 'lu': flt.get('lu_f', []), 'kp': flt.get('kp_f', []),
            'emp': (flt.get('emp_f') or [''])[0], 'tcr': (flt.get('tcr_f') or [''])[0]}


def tree_counts(d, tk, emps):
    """Как чарт: сотрудники в поддереве узла (у КП — один раз на узел)."""
    T, col, cnt = d['trees'][tk], d['cube'][tk], [0] * len(d['trees'][tk])
    for e in emps:
        seen = set()
        for x in (col[e] if tk == 'kp' else [col[e]]):
            while x is not None and x >= 0 and x not in seen:
                seen.add(x)
                cnt[x] += 1
                x = T[x]['par']
    return cnt


def independent(mode, stream, mu, lu, kp):
    print('— независимый расчёт: куб панели фильтров, режим %s' % mode)
    T = 'prod_proteus.mdm_employee_d_detail_last_day' + ('_functional' if mode == 'kp' else '')
    U = '(SELECT * FROM %s PREWHERE legal_employee_flg = 1 OR active_employee_flg = 1 LIMIT 1 BY mdm_employee_rk)' % T
    d, rows, _ = run_new({}, 'a.user', mode, view='filters')
    ok('%s: куб — ответ панели: meta, словари, коды, деревья' % mode, d['roles'] == {'meta', 'D', 'C', 'T'} and d['N'] > 0, d['roles'])
    n_all = int(q('SELECT count() AS n FROM %s' % U)[0]['n'])
    ok('%s: куб — все сотрудники периода (юридическая или активная численность)' % mode, d['N'] == n_all, (d['N'], n_all))
    # словари = все значения атрибутов
    bad = []
    for a in FACETS:
        src = "arrayJoin(if(length(login_reg_hr_list) = 0, ['-'], login_reg_hr_list))" if a == 'regional_hr_login' else "ifNull(toString(%s), '')" % a
        want = sorted(r['v'] for r in q('SELECT DISTINCT %s AS v FROM %s' % (src, U)))
        got = d['dict'].get(a)
        if sorted(got or []) != want or got != sorted(got or [], key=lambda x: x.encode('utf-8')):
            bad.append((a, len(got or []), len(want)))
    ok('%s: словари — все значения каждого атрибута, по возрастанию' % mode, not bad, bad[:3])
    # коды сотрудника = его значения (по сотруднику в порядке MasterID)
    emp_rows = q("SELECT mdm_employee_rk AS rk, ifNull(toString(office_desc), '') AS o, login_reg_hr_list AS r, ifNull(legal_employee_flg, 0) + 2 * ifNull(active_employee_flg, 0) AS em "
                 "FROM %s ORDER BY mdm_employee_rk" % U)
    okc = all(d['dict']['office_desc'][d['cube']['office_desc'][i]] == r['o'] and int(d['dict']['emp'][d['cube']['emp'][i]]) == int(r['em'])
              and sorted(d['dict']['regional_hr_login'][c] for c in d['cube']['regional_hr_login'][i]) == sorted(set(r['r']) or {'-'})
              for i, r in enumerate(emp_rows))
    ok('%s: коды сотрудников = их значения (офис, численность, рег. HR)' % mode, okc)
    # деревья: состав узлов, имена, родители, листы
    for tk, col, root, nl in [('mu', 'mapped_management_unit', 3, 12), ('lu', 'legal_unit', 1, 7)]:
        nodes = d['trees'][tk]
        exp = {}
        for lv in range(root, nl + 1):
            for r in q('SELECT lvl%d_%s_rk AS rk, any(lvl%d_%s_nm) AS nm, any(%s) AS p FROM %s WHERE rk IS NOT NULL GROUP BY rk'
                       % (lv, col, lv, col, ("ifNull(lvl%d_%s_rk, '')" % (lv - 1, col)) if lv > root else "''", U)):
                exp[(r['rk'], lv)] = (r['nm'], r['p'])
        badn = [(x['id'], x['lvl']) for x in nodes if exp.get((x['id'], x['lvl'])) != (x['name'], nodes[x['par']]['id'] if x['par'] >= 0 else '')]
        ok('%s: дерево %s целиком — узлы, имена, родители (%d узлов)' % (mode, tk, len(nodes)), not badn and len(nodes) == len(exp), (badn[:3], len(nodes), len(exp)))
        TREES.setdefault((mode, tk, False), ({}, {k: (0, 0, v[0], v[1], 0) for k, v in exp.items()}))
    # КП: узел = путь именами
    kp_rows = q('SELECT functional_lvl_all_array AS s FROM %s' % U)
    paths = set()
    for r in kp_rows:
        for a in (r['s'] or '').split(';'):
            lv = [x for x in a.split('<>')[:12] if x not in ('', '-')]
            for i in range(1, len(lv) + 1):
                paths.add('\x1f'.join(lv[:i]))
    got = [x['id'] for x in d['trees']['kp']]
    ok('%s: дерево КП целиком — пути, порядок обхода' % mode, set(got) == paths and got == sorted(got, key=lambda p: p.encode('utf-8')), (len(got), len(paths)))
    # счётчики «при остальных» по кубу (как чарт) = независимый SQL; итог по кубу = итог датасета списка
    kpn = '\x1f'.join([kp['a'], kp['b']])
    combos = [{},
              {'flt_f': ['emp_specialization_it_code=IT', 'emp_stream_desc=' + stream, 'regional_hr_login=-'], 'mu_f': [mu['rk']]},
              {'flt_f': ['office_desc=' + d['dict']['office_desc'][1], 'city_nm=' + d['dict']['city_nm'][2]], 'lu_f': [lu['rk']],
               'kp_f': [kpn], 'emp_f': ['Активная'], 'tcr_f': ['ТЦР РФ + ТЦР СНГ']}]
    for flt in combos:
        tag = '%s %s' % (mode, 'без фильтров' if not flt else 'фильтры ' + '/'.join(sorted(flt)))
        sel = sel_of(flt)
        emps = ch.cube_count(d, sel)
        dl, _, _ = run_new(flt, 'a.user', mode)
        ok(tag + ': итог по кубу = итог датасета списка', len(emps) == int(dl['meta']['m']['total']), (len(emps), dl['meta']['m']['total']))
        bad = []
        for a in FACETS:
            base = ch.cube_count(d, sel, skip=a)
            col, dv, cnt = d['cube'][a], d['dict'][a], {}
            for e in base:
                for c in (col[e] if a == 'regional_hr_login' else [col[e]]):
                    cnt[dv[c]] = cnt.get(dv[c], 0) + 1
            src = "arrayJoin(if(length(login_reg_hr_list) = 0, ['-'], login_reg_hr_list))" if a == 'regional_hr_login' else "ifNull(toString(%s), '')" % a
            exp = {r['v']: int(r['n']) for r in q('SELECT %s AS v, countIf(%s) AS n FROM %s GROUP BY v HAVING n > 0' % (src, where_indep(flt, a), U))}
            if cnt != exp:
                bad.append((a, sorted(set(cnt.items()) ^ set(exp.items()))[:3]))
        ok(tag + ': счётчики значений «при остальных» по кубу = независимый SQL', not bad, bad[:3])
        for tk, colname, root, nl in [('mu', 'mapped_management_unit', 3, 12), ('lu', 'legal_unit', 1, 7)]:
            cnt = tree_counts(d, tk, ch.cube_count(d, sel, skip=tk))
            exp = {}
            for lv in range(root, nl + 1):
                for r in q('SELECT lvl%d_%s_rk AS rk, countIf(%s) AS n FROM %s WHERE rk IS NOT NULL GROUP BY rk' % (lv, colname, where_indep(flt, tk), U)):
                    exp[(r['rk'], lv)] = int(r['n'])
            badn = [(x['id'], cnt[i], exp.get((x['id'], x['lvl']))) for i, x in enumerate(d['trees'][tk]) if cnt[i] != exp.get((x['id'], x['lvl']))]
            ok('%s: счётчики узлов %s по кубу = независимый SQL' % (tag, tk), not badn, badn[:3])
        base = set(ch.cube_count(d, sel, skip='kp'))
        rks = q('SELECT mdm_employee_rk AS rk, functional_lvl_all_array AS s, %s AS ok FROM %s ORDER BY mdm_employee_rk' % (where_indep(flt, 'kp'), U))
        exp = {}
        for i, r in enumerate(rks):
            if not int(r['ok']):
                continue
            seen = set()
            for a in (r['s'] or '').split(';'):
                lv = [x for x in a.split('<>')[:12] if x not in ('', '-')]
                for k in range(1, len(lv) + 1):
                    seen.add('\x1f'.join(lv[:k]))
            for pth in seen:
                exp[pth] = exp.get(pth, 0) + 1
        cnt = tree_counts(d, 'kp', sorted(base))
        badk = [(x['id'], cnt[i], exp.get(x['id'], 0)) for i, x in enumerate(d['trees']['kp']) if cnt[i] != exp.get(x['id'], 0)]
        ok('%s: счётчики узлов КП по кубу = независимый расчёт' % tag, not badk, badk[:3])


# ---------- 3. поведение ----------
def first_rows(d, i):
    """Значения колонки сотрудника по порядку ответа: у КП — из первой строки блока (как читает чарт)."""
    seen, out = set(), []
    for r in d['rows']:
        if r[0] not in seen:
            seen.add(r[0])
            out.append(r[i])
    return out


def behaviour(mode, stream, kp):
    print('— части ответа, сортировка, лимит, эхо, ввод, доступ, режимы ClickHouse: %s' % mode)
    d, rows, _ = run_new({}, 'a.user', mode)
    ok('%s: список по умолчанию — meta и строки, MasterID и дата найма' % mode,
       d['roles'] == {'meta', 'r'} and len(set(r[0] for r in d['rows'])) == 5000 and d['cols'] == ['master_id', 'hiredate'], (d['roles'], d['cols']))
    d, rows, _ = run_new({}, 'a.user', mode, view='filters')
    ok('%s: панель фильтров по умолчанию — meta и куб (словари, коды, три дерева), без строк' % mode,
       d['roles'] == {'meta', 'D', 'C', 'T'} and set(k for k in d['trees'] if ':' not in k) == {'mu', 'lu', 'kp'} and not d['rows']
       and d['meta']['dates'], (d['roles'], sorted(d['trees'])))
    # куб не зависит от фильтров атрибутов и структур: сужают его только период и список сотрудников
    d2, _, _ = run_new({'flt_f': ['emp_specialization_it_code=IT'], 'emp_f': ['Активная'], 'tcr_f': ['ТЦР РФ']}, 'a.user', mode, view='filters')
    ok('%s: куб не зависит от фильтров атрибутов, численности и ТЦР' % mode, d2['cube'] == d['cube'] and d2['dict'] == d['dict'] and d2['N'] == d['N'])
    ids = q("SELECT toString(mdm_employee_rk) AS r FROM prod_proteus.mdm_employee_d_detail_last_day WHERE legal_employee_flg = 1 LIMIT 7")
    d3, _, _ = run_new({'id_f': ['rk=' + r['r'] for r in ids]}, 'a.user', mode, view='filters')
    ok('%s: «Сотрудники по списку» сужают куб' % mode, d3['N'] == 7, d3['N'])
    d4, _, _ = run_new({'per_f': ['date'], 'dt_f': ['2026-08-31']}, 'a.user', mode, view='filters')
    ok('%s: «Период» куб не меняет — действующие на последний день, эхо даты есть' % mode,
       d4['cube'] == d['cube'] and d4['dict'] == d['dict'] and d4['meta']['m']['per'] == 'date' and d4['meta']['m']['dt'] == '2026-08-31',
       (d4['N'], d['N']))
    d, rows, _ = run_new({'pt_f': ['f', 'q'], 'q_f': ['mu=инвест'], 'frq_f': ['f-7']}, 'a.user', mode)
    ok('%s: список не читает поиск и части, эхо метки панели фильтров' % mode,
       d['roles'] == {'meta', 'r'} and d['meta']['m']['frq'] == 'f-7' and 'dates' not in d['meta'], (d['roles'], d['meta']['m'].get('frq')))
    d, rows, _ = run_new({'lim_f': ['10000']}, 'hr.super', mode)
    emp = len(set(r[0] for r in d['rows']))
    ok('%s: без колонок аллокации — строка на сотрудника' % mode, emp == 10000 and len(d['rows']) == 10000, (emp, len(d['rows'])))
    if mode == 'kp':
        d, rows, _ = run_new({'cols_f': ['full_nm', 'kp1'], 'lim_f': ['10000']}, 'hr.super', mode)
        emp = len(set(r[0] for r in d['rows']))
        ok('kp: с уровнем КП — строка на аллокацию', emp == 10000 and len(d['rows']) > 10000 and d['cols'] == ['master_id', 'full_nm', 'kp1'],
           (emp, len(d['rows']), d['cols']))
        d, rows, _ = run_new({'cols_f': ['kp2', 'alloc'], 'lim_f': ['5000']}, 'hr.super', mode)
        ok('kp: только MasterID и поля аллокации', d['cols'] == ['master_id', 'kp2', 'alloc'] and all(len(r) == 3 for r in d['rows']),
           (d['cols'], d['rows'][:1]))
    # размер запроса: списки — константами WITH; худший случай (2 000 логинов + 500 значений) < max_query_size
    logins = ['login=some.long.login.user%d' % i for i in range(2000)]
    many = ['%s=Значение номер %d длинное' % (a, i) for a in ['office_desc', 'city_nm', 'legal_position_nm'] for i in range(200)]
    big = {'flt_f': many, 'id_f': logins}
    size = max(len(ch.sql(ch.carriers(big, mode), 'a.user', mode, view=v).encode('utf-8')) for v in ['list', 'filters'])
    ok('%s: худший запрос меньше max_query_size (256 КБ)' % mode, size < 256 * 1024, size)
    d, rows, _ = run_new(big, 'a.user', mode, view='filters')
    ok('%s: значений атрибутов — не больше 500, логинов — 2 000' % mode,
       len(d['meta']['a']['flt']) == 500 and len(d['meta']['a']['id']) == 2000, (len(d['meta']['a']['flt']), len(d['meta']['a']['id'])))
    other = {'flt_f': ['emp_specialization_it_code=IT'], 'lim_f': ['10000']} if mode == 'kp' else {'flt_kf': ['emp_specialization_it_code=IT'], 'lim_kf': ['10000']}
    rows, _ = ch.dataset(other, 'a.user', mode, raw_carriers=True)
    d = ch.decode(rows)
    ok('%s: носители другого чарта не действуют' % mode, d['meta']['m']['total'] == d['meta']['m']['all'] and d['meta']['m']['lim'] == '5000'
       and d['meta']['m']['cf'] == ('_kf' if mode == 'kp' else '_f'), d['meta']['m'])
    d, rows, _ = run_new({'rq_f': ['r-42'], 'lim_f': ['10000']}, 'a.user', mode)
    m = d['meta']['m']
    ok('%s: эхо метки запроса' % mode, m['rq'] == 'r-42' and rows and [r for r in rows if r['role'] == 'meta'][0]['v'] == 'r-42', m['rq'])
    emp = len(set(r[0] for r in d['rows']))
    ok('%s: лимит 10 000 сотрудников' % mode, emp == 10000 and m['lim'] == '10000', (emp, m['lim']))
    ok('%s: пачки по 500 сотрудников и порядок' % mode,
       [int(r[0]) for r in d['rows']] == sorted(int(r[0]) for r in d['rows']), 'порядок строк')
    d, rows, _ = run_new({'lim_f': ['777'], 'sort_f': ['drop table:asc'], 'cols_f': ['nope', 'full_nm', 'full_nm']}, 'a.user', mode)
    m = d['meta']['m']
    ok('%s: чужой лимит и сортировка — по умолчанию' % mode, m['lim'] == '5000' and m['sort'] == 'master_id:asc', (m['lim'], m['sort']))
    ok('%s: неизвестные и повторные колонки отброшены' % mode, d['cols'] == (['master_id', 'hiredate', 'full_nm'] if mode == 'us'
       else ['master_id', 'full_nm']), d['cols'])
    # сортировка на сервере по тексту и по маскированному полю
    d, rows, _ = run_new({'sort_f': ['legal_position_nm:desc'], 'cols_f': ['legal_position_nm'], 'lim_f': ['5000']}, 'hr.super', mode)
    i = d['cols'].index('legal_position_nm')
    vals = first_rows(d, i)
    top = q("SELECT max(legal_position_nm) AS v FROM prod_proteus.mdm_employee_d_detail_last_day%s PREWHERE legal_employee_flg = 1"
            % ('_functional' if mode == 'kp' else ''))[0]['v']
    ok('%s: сортировка на сервере по убыванию' % mode, vals and vals[0] == top and vals == sorted(vals, reverse=True), (vals[:2], top))
    d, rows, _ = run_new({'sort_f': ['full_nm:asc'], 'cols_f': ['full_nm'], 'lim_f': ['25000']}, 'a.user', mode)
    i = d['cols'].index('full_nm')
    vals = first_rows(d, i)
    first_mask = vals.index(MASK_NEW) if MASK_NEW in vals else len(vals)
    ok('%s: скрытое warden при сортировке — в конце' % mode, all(v == MASK_NEW for v in vals[first_mask:]) and
       vals[:first_mask] == sorted(vals[:first_mask]), (first_mask, len(vals)))
    # враждебный ввод
    evil = {'flt_f': ["office_desc=О'Коннор\\", "emp_stream_desc=x') OR 1=1 --", 'unknown=1', 'noeq'],
            'mu_f': ["x'; DROP TABLE t; --", 'abc'], 'kp_f': ["a'\\\x1fb"], 'id_f': ["login=a'b", 'rk=12a', 'tab=\\'],
            'q_f': ["mu=' OR 1=1"], 'dt_f': ["2026-13-45'"], 'per_f': ['date'], 'rq_f': ["'\\"], 'sort_f': ["full_nm:asc'"],
            'cols_f': ["full_nm'"], 'emp_f': ["'"], 'tcr_f': ["ТЦР РФ'"]}
    for view in ['list', 'filters']:
        try:
            d, rows, _ = run_new(evil, 'a.user', mode, view=view)
            ok('%s %s: враждебный ввод — запрос цел, ничего не найдено' % (mode, view), d['meta'] and d['meta']['m']['total'] == '0',
               d['meta']['m']['total'])
            ok('%s %s: враждебный ввод — эхо без лишнего' % (mode, view), d['meta']['a']['mu'] == ['abc'] and d['meta']['a']['cols'][-1] != "full_nm'",
               d['meta']['a'])
        except Exception as e:  # noqa: BLE001
            ok('%s %s: враждебный ввод — запрос цел' % (mode, view), False, e)
        # AlwaysTrue при сохранении датасета
        try:
            rows, _ = ch.dataset({}, 'a.user', mode, always_true=True, view=view)
            d = ch.decode(rows)
            ok('%s %s: AlwaysTrue — датасет сохраняется, ответ по умолчанию' % (mode, view), d['meta']['m']['total'] != '0'
               and (d['cols'] == ['master_id', 'hiredate'] and len(d['rows']) == 5000 if view == 'list' else d['N'] > 0 and len(d['dict']) > 20))
        except Exception as e:  # noqa: BLE001
            ok('%s %s: AlwaysTrue' % (mode, view), False, e)
        # нет строки в warden — только meta
        d, rows, _ = run_new({}, 'nobody', mode, view=view)
        roles = set(r['role'] for r in rows)
        ok('%s %s: без строки в warden — только meta, ok = 0' % (mode, view), roles == {'meta'} and d['meta']['m']['ok'] == '0', roles)
    # режимы ClickHouse 24.8
    def sig(d):
        return (d['meta']['m']['total'], d['rows'], d['dict'], d['cube'], d['N'],
                {k: [(x['id'], x['own'], x['par'], x['end']) for x in v] for k, v in d['trees'].items() if ':' not in k})
    rk = TREES[(mode, 'mu', False)]
    mu4 = sorted(k for k in rk[1] if k[1] == 4)[0][0]
    variants = [
        ({'flt_f': ['emp_specialization_it_code=IT', 'emp_stream_desc=' + stream], 'cols_f': ['full_nm', 'grade', 'kp1'],
          'mu_f': [mu4]}, 'filters'),
        ({'flt_f': ['emp_specialization_it_code=IT', 'emp_stream_desc=' + stream], 'cols_f': ['full_nm', 'grade', 'kp1', 'alloc'],
          'mu_f': [mu4]}, 'list'),
        ({'flt_f': ['emp_specialization_it_code=IT'], 'lu_f': [sorted(TREES[(mode, 'lu', False)][1])[0][0]]}, 'list'),
        ({'per_f': ['date'], 'dt_f': ['2026-08-31'], 'id_f': ['login=' + r['l'] for r in q("SELECT ad_login AS l FROM prod_proteus.mdm_employee_d_detail_last_day LIMIT 3000")]}, 'filters'),
    ]
    # круг sqlglot: перепечатанный запрос — тот же ответ (разделитель пути КП, сортировки, поиск, ввод)
    kpath = '\x1f'.join([kp['a'], kp['b']])
    rt = variants + [
        ({}, 'list'),
        ({}, 'filters'),
        ({'kp_f': [kpath], 'sort_f': ['company_fire_dt:desc'], 'cols_f': ['kp3', 'full_nm']}, 'list'),
        ({'kp_f': [kpath]}, 'filters'),
        ({'per_f': ['date'], 'dt_f': ['2026-08-31'], 'emp_f': ['Активная'], 'tcr_f': ['ТЦР РФ']}, 'filters'),
        ({'id_f': ['login=' + r['l'] for r in q("SELECT ad_login AS l FROM prod_proteus.mdm_employee_d_detail_last_day LIMIT 50")],
          'sort_f': ['grade:asc'], 'lim_f': ['10000'], 'cols_f': ['grade', 'full_nm']}, 'list'),
        (evil, 'list'),
        (evil, 'filters'),
    ]
    for vi, (flt, view) in enumerate(rt):
        for user in (['a.user', 'hr.super'] if vi in (len(variants), len(variants) + 1) else ['a.user']):
            try:
                a, _, _ = run_new(flt, user, mode, view=view)
                b, _, _ = run_new(flt, user, mode, reprinted=True, view=view)
                ok('%s %s: круг sqlglot, вариант %d, %s — ответ тот же' % (mode, view, vi + 1, user), sig(a) == sig(b) and a['cols'] == b['cols'],
                   (a['meta']['m']['total'], b['meta']['m']['total']))
            except Exception as e:  # noqa: BLE001
                ok('%s: круг sqlglot, вариант %d, %s' % (mode, vi + 1, user), False, e)
    for vi, (flt, view) in enumerate(variants):
        base, _, _ = run_new(flt, 'a.user', mode, view=view)
        for st in ['allow_experimental_analyzer = 0', 'prefer_column_name_to_alias = 1', 'join_use_nulls = 1', 'group_by_use_nulls = 1',
                   'allow_experimental_analyzer = 0, prefer_column_name_to_alias = 1, join_use_nulls = 1, group_by_use_nulls = 1']:
            try:
                d, _, _ = run_new(flt, 'a.user', mode, settings=st, view=view)
                ok('%s %s: вариант %d, %s — ответ тот же' % (mode, view, vi + 1, st), sig(d) == sig(base))
            except Exception as e:  # noqa: BLE001
                ok('%s: вариант %d, %s' % (mode, vi + 1, st), False, e)


def main():
    modes = [a for a in sys.argv[1:] if a in ('us', 'kp')] or ['us', 'kp']
    t0 = time.time()
    for mode in modes:
        stream, mu, lu, kp = oracle(mode)
        independent(mode, stream, mu, lu, kp)
        behaviour(mode, stream, kp)
    print('\n%d проверок, провалов: %d (%.0f с)' % (PASSED[0] + len(FAILS), len(FAILS), time.time() - t0))
    for f in FAILS:
        print('  ✗', f)
    sys.exit(1 if FAILS else 0)


if __name__ == '__main__':
    main()
