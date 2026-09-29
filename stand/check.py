"""Проверки датасета «Детальных списков» на стенде (chdb = ClickHouse 24.8).

    python3 stand/world.py              # мир один раз (stand/.db)
    python3 stand/check.py [us|kp]      # проверки обоих режимов (или одного)

1. Оракул — прежний датасет из выгрузки (mdm_employee_d_detail_echarts / …functional_echarts),
   запущенный как есть: при тех же фильтрах новый отдаёт тех же сотрудников и те же значения
   всех полей, включая маски warden (у нового скрытое — '⛔' вместо текста). Пользователи —
   частичный доступ, всё, лидер профессии, правило логина из CROSS-8440; фильтры — атрибуты,
   узлы УС / ЮС (по справочнику старого кросс-фильтра), уровни КП, региональный HR, ТЦР,
   численность, пользовательская дата, списки MasterID и логинов.
2. Независимый расчёт (SQL, собранный здесь, не Jinja датасета): счётчики значений фильтров
   «при остальных фильтрах», счётчики узлов деревьев, окрестность дерева, поиск.
   Флаг «есть дети» у узлов, число узлов дерева, дети узла по запросу, подписи выбранных узлов.
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


def run_new(flt, user, mode, cols=None, settings='', reprinted=False):
    f = dict(flt)
    if cols is not None:
        f['cols_f'] = cols
    rows, dt = ch.dataset(f, user, mode, settings=settings, reprinted=reprinted)
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
    return ' AND '.join(parts) or '1'


def independent(mode, stream, mu, lu):
    print('— независимый расчёт: значения фильтров и деревья, режим %s' % mode)
    T = 'prod_proteus.mdm_employee_d_detail_last_day' + ('_functional' if mode == 'kp' else '')
    U = '(SELECT * FROM %s PREWHERE legal_employee_flg = 1 LIMIT 1 BY mdm_employee_rk)' % T if mode == 'kp' else \
        '%s PREWHERE legal_employee_flg = 1' % T
    for flt in [{}, {'flt_f': ['emp_specialization_it_code=IT', 'emp_stream_desc=' + stream, 'regional_hr_login=-'], 'mu_f': [mu['rk']]}]:
        d, rows, _ = run_new(dict(flt, pt_f=ALL_PARTS), 'a.user', mode)
        tag = '%s %s' % (mode, 'без фильтров' if not flt else 'с фильтрами')
        # фасеты
        bad = []
        for a in FACETS:
            got = d['f'].get(a, {})
            if a == 'regional_hr_login':
                src = "arrayJoin(if(length(login_reg_hr_list) = 0, ['-'], login_reg_hr_list))"
            else:
                src = "ifNull(toString(%s), '')" % a
            exp = {r['v']: (int(r['n']), int(r['a'])) for r in q(
                'SELECT %s AS v, countIf(%s) AS n, count() AS a FROM %s GROUP BY v' % (src, where_indep(flt, a), U))}
            top = sorted(exp.items(), key=lambda kv: (-kv[1][0], kv[0]))[:300]
            want = set(v for v, _ in top) | set(x.split('=', 1)[1] for x in flt.get('flt_f', []) if x.split('=', 1)[0] == a)
            if set(got) != want:
                bad.append((a, 'состав', len(got), len(want), sorted(set(got) ^ want)[:3]))
                continue
            for v, (n, al, nv) in got.items():
                if (n, al) != exp.get(v) or nv != len(exp):
                    bad.append((a, v, (n, al, nv), exp.get(v), len(exp)))
                    break
        ok(tag + ': значения фильтров = счёт «при остальных» (и первые 300)', not bad, bad[:3])
        # деревья УС и ЮС
        for tk, col, root in [('mu', 'mapped_management_unit', 3), ('lu', 'legal_unit', 1)]:
            nodes = d['t'].get(tk, [])
            nl = 12 if tk == 'mu' else 7
            exp = {}
            for lv in range(root, nl + 1):
                nxt = ('max(lvl%d_%s_rk IS NOT NULL)' % (lv + 1, col)) if lv < nl else '0'
                for r in q('SELECT lvl%d_%s_rk AS rk, countIf(%s) AS n, count() AS a, any(lvl%d_%s_nm) AS nm, any(%s) AS p, %s AS hk FROM %s '
                           'WHERE rk IS NOT NULL GROUP BY rk' % (lv, col, where_indep(flt, tk), lv, col,
                                                                 ("ifNull(lvl%d_%s_rk, '')" % (lv - 1, col)) if lv > root else "''", nxt, U)):
                    exp[(r['rk'], lv)] = (int(r['n']), int(r['a']), r['nm'], r['p'], int(r['hk']))
            badn = [(x['id'], x['lvl'], (x['n'], x['all'], x['name'], x['pid'], x['hk']), exp.get((x['id'], x['lvl']))) for x in nodes
                    if exp.get((x['id'], x['lvl'])) != (x['n'], x['all'], x['name'], x['pid'], x['hk'])]
            ok('%s: дерево %s — счётчики, имена, родители, есть дети' % (tag, tk), not badn, badn[:3])
            ok('%s: дерево %s — число узлов дерева' % (tag, tk), nodes and all(x['nodes'] == len(exp) for x in nodes),
               (nodes[0]['nodes'] if nodes else None, len(exp)))
            TREES.setdefault((mode, tk, bool(flt)), (flt, exp))
            full = len(exp) <= 1500
            if full:
                ok('%s: дерево %s целиком (%d узлов)' % (tag, tk, len(exp)), len(nodes) == len(exp), (len(nodes), len(exp)))
            else:
                top = set(k for k in exp if k[1] < root + 3)
                have = set((x['id'], x['lvl']) for x in nodes)
                ok('%s: дерево %s — верхние 3 уровня' % (tag, tk), top <= have, len(top - have))
                sel = flt.get(tk + '_f', [])
                if sel:
                    lv = [k[1] for k in exp if k[0] == sel[0]][0]
                    kids = set(k for k in exp if k[1] == lv + 1 and exp[k][3] == sel[0])
                    ok('%s: дерево %s — дети выбранного узла' % (tag, tk), kids <= have, len(kids - have))
    # дерево КП: узел = путь именами, сотрудник — один раз
    d, rows, _ = run_new({'pt_f': ['kp']}, 'a.user', mode)
    kp_rows = q('SELECT functional_lvl_all_array AS s FROM %s' % U)
    cnt = {}
    for r in kp_rows:
        seen = set()
        for a in (r['s'] or '').split(';'):
            lv = [x for x in a.split('<>')[:12] if x not in ('', '-')]
            for i in range(1, len(lv) + 1):
                seen.add('\x1f'.join(lv[:i]))
        for p in seen:
            cnt[p] = cnt.get(p, 0) + 1
    nodes = d['t'].get('kp', [])
    kids = set(p.rsplit('\x1f', 1)[0] for p in cnt if '\x1f' in p)
    badk = [(x['path'], x['n'], cnt.get(x['path'])) for x in nodes if cnt.get(x['path']) != x['n'] or x['name'] != x['path'].split('\x1f')[-1]
            or x['hk'] != (1 if x['path'] in kids else 0) or x['nodes'] != len(cnt)]
    ok('%s: дерево КП — счётчики по пути имён, есть дети, число узлов' % mode, not badk and nodes, badk[:3])
    top = set(p for p in cnt if p.count('\x1f') < 3)
    ok('%s: дерево КП — верхние 3 уровня' % mode, top <= set(x['path'] for x in nodes), len(top - set(x['path'] for x in nodes)))
    # дети узла КП по запросу
    par = sorted((p for p in kids if p.count('\x1f') == 1), key=lambda p: -cnt[p])[0]
    d, rows, _ = run_new({'pt_f': ['q'], 'q_f': ['kp>' + par]}, 'a.user', mode)
    got = sorted((x['path'], x['n'], x['hk'], x['lvl']) for x in d['q'].get('kp', []))
    want = sorted((p, cnt[p], 1 if p in kids else 0, p.count('\x1f') + 1) for p in cnt if p.rsplit('\x1f', 1)[0] == par and p.count('\x1f') == 2)
    ok('%s: дети узла КП — состав, счётчики, есть дети' % mode, got == want and got, (got[:2], want[:2]))
    ok('%s: ответ поиска — только meta и находки' % mode, d['roles'] == {'meta', 'q'}, d['roles'])
    # дети узла УС / ЮС по запросу и подписи выбранных
    for tk in ['mu', 'lu']:
        flt, exp = TREES[(mode, tk, False)]
        root = 3 if tk == 'mu' else 1
        par = sorted((k for k in exp if exp[k][4] and k[1] == root + 1), key=lambda k: -exp[k][1])[0]
        d, rows, _ = run_new({'pt_f': ['q'], 'q_f': [tk + '>' + par[0]]}, 'a.user', mode)
        got = sorted((x['id'], x['lvl'], x['n'], x['all'], x['name'], x['pid'], x['hk']) for x in d['q'].get(tk, []))
        want = sorted((k[0], k[1]) + (e[0], e[1], e[2], e[3], e[4]) for k, e in exp.items() if k[1] == par[1] + 1 and e[3] == par[0])
        ok('%s: дети узла %s — состав, счётчики, есть дети' % (mode, tk), got == want and got, (got[:2], want[:2]))
        deep = sorted((k for k in exp if k[1] == root + 3), key=lambda k: -exp[k][1])[0]
        d, rows, _ = run_new({tk + '_f': [deep[0], par[0]]}, 'a.user', mode)
        sn = {x['id']: x for x in d['s'].get(tk, [])}
        okn = set(sn) == {deep[0], par[0]} and sn[deep[0]]['name'] == exp[deep][2] and sn[deep[0]]['lvl'] == deep[1] \
            and sn[deep[0]]['path'].count(' › ') == 2 and sn[deep[0]]['pid'] == exp[deep][3] and sn[par[0]]['path'].count(' › ') == 0
        ok('%s: подписи выбранных узлов %s — имя, уровень, путь' % (mode, tk), okn, [(x['name'], x['lvl'], x['path']) for x in sn.values()])
    # поиск узла
    for tk in ['mu', 'lu', 'kp']:
        d, rows, _ = run_new({'pt_f': ['q'], 'q_f': [tk + '=инвест']}, 'a.user', mode)
        hits = d['q'].get(tk, [])
        okh = hits and all('инвест' in h['name'].lower() for h in hits) and len(hits) <= 60
        ok('%s: поиск %s по имени — находки с «инвест»' % (mode, tk), okh, [h['name'] for h in hits[:3]])
        if tk == 'mu' and hits:
            h = hits[0]
            n = q("SELECT count() AS n FROM %s WHERE lvl%d_mapped_management_unit_rk = %s" % (U, h['lvl'], lit(h['id'])))[0]['n']
            ok('%s: поиск mu — счётчик находки' % mode, int(n) == h['n'], (n, h['n']))
            ok('%s: поиск mu — путь находки' % mode, h['path'].count(' › ') == max(0, h['lvl'] - 4), h['path'])
    d, rows, _ = run_new({'pt_f': ['q'], 'q_f': ['f:legal_position_nm=юрист']}, 'a.user', mode)
    fq = d['fq'].get('legal_position_nm', {})
    ok('%s: поиск значения атрибута' % mode, fq and all('юрист' in v.lower() for v in fq), list(fq)[:3])


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
    ok('%s: по умолчанию — только meta и строки' % mode, d['roles'] == {'meta', 'r'} and len(set(r[0] for r in d['rows'])) == 5000,
       d['roles'])
    d, rows, _ = run_new({'pt_f': ['f']}, 'a.user', mode)
    ok('%s: часть f — meta и значения фильтров' % mode, d['roles'] == {'meta', 'f'} and d['meta']['a']['pt'] == ['f'], d['roles'])
    d, rows, _ = run_new({'pt_f': ['q', 'bogus']}, 'a.user', mode)
    ok('%s: q без строки поиска — только meta' % mode, d['roles'] == {'meta'} and d['meta']['a']['pt'] == ['q'], d['roles'])
    d, rows, _ = run_new({'lim_f': ['10000']}, 'hr.super', mode)
    emp = len(set(r[0] for r in d['rows']))
    if mode == 'us':
        ok('us: строка на сотрудника', emp == 10000 and len(d['rows']) == 10000, (emp, len(d['rows'])))
    else:
        ok('kp: строка на аллокацию', emp == 10000 and len(d['rows']) > 10000, (emp, len(d['rows'])))
    # размер запроса: списки — константами WITH; худший случай (2 000 логинов + 500 значений) < max_query_size
    logins = ['login=some.long.login.user%d' % i for i in range(2000)]
    many = ['%s=Значение номер %d длинное' % (a, i) for a in ['office_desc', 'city_nm', 'legal_position_nm'] for i in range(200)]
    big = {'flt_f': many, 'id_f': logins, 'pt_f': ALL_PARTS}
    size = len(ch.sql(ch.carriers(big, mode), 'a.user', mode).encode('utf-8'))
    ok('%s: худший запрос меньше max_query_size (256 КБ)' % mode, size < 256 * 1024, size)
    d, rows, _ = run_new(big, 'a.user', mode)
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
    ok('%s: в строках — все поля реестра' % mode, d['cols'] == keys_for(mode), d['cols'][:4])
    ok('%s: пачки по 500 сотрудников и порядок' % mode,
       [int(r[0]) for r in d['rows']] == sorted(int(r[0]) for r in d['rows']), 'порядок строк')
    d, rows, _ = run_new({'lim_f': ['777'], 'sort_f': ['drop table:asc'], 'cols_f': ['nope', 'full_nm', 'full_nm']}, 'a.user', mode)
    m = d['meta']['m']
    ok('%s: чужой лимит и сортировка — по умолчанию' % mode, m['lim'] == '5000' and m['sort'] == 'master_id:asc', (m['lim'], m['sort']))
    ok('%s: носитель колонок не действует — все поля реестра' % mode, d['cols'] == keys_for(mode), d['cols'][:4])
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
    try:
        d, rows, _ = run_new(evil, 'a.user', mode)
        ok('%s: враждебный ввод — запрос цел, ничего не найдено' % mode, d['meta'] and d['meta']['m']['total'] == '0', d['meta']['m']['total'])
        ok('%s: враждебный ввод — эхо без лишнего' % mode, d['meta']['a']['mu'] == ['abc'] and d['meta']['a']['cols'][-1] != "full_nm'",
           d['meta']['a'])
    except Exception as e:  # noqa: BLE001
        ok('%s: враждебный ввод — запрос цел' % mode, False, e)
    # AlwaysTrue при сохранении датасета
    try:
        rows, _ = ch.dataset({}, 'a.user', mode, always_true=True)
        d = ch.decode(rows)
        ok('%s: AlwaysTrue — датасет сохраняется, ответ по умолчанию' % mode, d['meta']['m']['total'] != '0' and d['cols'][0] == 'master_id')
    except Exception as e:  # noqa: BLE001
        ok('%s: AlwaysTrue' % mode, False, e)
    # нет строки в warden — только meta
    d, rows, _ = run_new({}, 'nobody', mode)
    roles = set(r['role'] for r in rows)
    ok('%s: без строки в warden — только meta, ok = 0' % mode, roles == {'meta'} and d['meta']['m']['ok'] == '0', roles)
    # режимы ClickHouse 24.8
    def sig(d):
        return (d['meta']['m']['total'], d['rows'], d['f'], d['fq'],
                {k: sorted((x['id'], x['n'], x['hk'], x['path']) for x in v) for k, v in d['t'].items()},
                {k: sorted((x['id'], x['n'], x['hk'], x['path']) for x in v) for k, v in d['q'].items()},
                {k: sorted((x['id'], x['name'], x['path']) for x in v) for k, v in d['s'].items()})
    rk = TREES[(mode, 'mu', False)]
    mu4 = sorted((k for k in rk[1] if rk[1][k][4] and k[1] == 4), key=lambda k: -rk[1][k][1])[0][0]
    variants = [
        {'flt_f': ['emp_specialization_it_code=IT', 'emp_stream_desc=' + stream], 'q_f': ['mu=инвест'], 'cols_f': ['full_nm', 'grade', 'kp1'],
         'pt_f': ALL_PARTS, 'mu_f': [mu4]},
        {'flt_f': ['emp_specialization_it_code=IT'], 'q_f': ['kp=инвест'], 'pt_f': ['q'], 'lu_f': [sorted(TREES[(mode, 'lu', False)][1])[0][0]]},
        {'q_f': ['mu>' + mu4], 'pt_f': ['q']},
        {'q_f': ['f:office_desc=офис'], 'pt_f': ['q', 'f']},
    ]
    # круг sqlglot: перепечатанный запрос — тот же ответ (разделитель пути КП, сортировки, поиск, ввод)
    kpath = '\x1f'.join([kp['a'], kp['b']])
    rt = variants + [
        {},
        {'kp_f': [kpath], 'pt_f': ['r', 'f', 'kp'], 'sort_f': ['company_fire_dt:desc']},
        {'q_f': ['kp>' + kpath], 'pt_f': ['q']},
        {'q_f': ['lu=инвест'], 'pt_f': ['q'], 'per_f': ['date'], 'dt_f': ['2026-08-31'], 'emp_f': ['Активная'], 'tcr_f': ['ТЦР РФ']},
        {'id_f': ['login=' + r['l'] for r in q("SELECT ad_login AS l FROM prod_proteus.mdm_employee_d_detail_last_day LIMIT 50")],
         'sort_f': ['grade:asc'], 'lim_f': ['10000']},
        evil,
    ]
    for vi, flt in enumerate(rt):
        for user in (['a.user', 'hr.super'] if vi == len(variants) else ['a.user']):
            try:
                a, _, _ = run_new(flt, user, mode)
                b, _, _ = run_new(flt, user, mode, reprinted=True)
                ok('%s: круг sqlglot, вариант %d, %s — ответ тот же' % (mode, vi + 1, user), sig(a) == sig(b) and a['cols'] == b['cols'],
                   (a['meta']['m']['total'], b['meta']['m']['total']))
            except Exception as e:  # noqa: BLE001
                ok('%s: круг sqlglot, вариант %d, %s' % (mode, vi + 1, user), False, e)
    for vi, flt in enumerate(variants):
        base, _, _ = run_new(flt, 'a.user', mode)
        for st in ['allow_experimental_analyzer = 0', 'prefer_column_name_to_alias = 1', 'join_use_nulls = 1', 'group_by_use_nulls = 1',
                   'allow_experimental_analyzer = 0, prefer_column_name_to_alias = 1, join_use_nulls = 1, group_by_use_nulls = 1']:
            try:
                d, _, _ = run_new(flt, 'a.user', mode, settings=st)
                ok('%s: вариант %d, %s — ответ тот же' % (mode, vi + 1, st), sig(d) == sig(base))
            except Exception as e:  # noqa: BLE001
                ok('%s: вариант %d, %s' % (mode, vi + 1, st), False, e)


def main():
    modes = [a for a in sys.argv[1:] if a in ('us', 'kp')] or ['us', 'kp']
    t0 = time.time()
    for mode in modes:
        stream, mu, lu, kp = oracle(mode)
        independent(mode, stream, mu, lu)
        behaviour(mode, stream, kp)
    print('\n%d проверок, провалов: %d (%.0f с)' % (PASSED[0] + len(FAILS), len(FAILS), time.time() - t0))
    for f in FAILS:
        print('  ✗', f)
    sys.exit(1 if FAILS else 0)


if __name__ == '__main__':
    main()
