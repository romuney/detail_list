"""Разбор SQL датасета так, как его разбирает Proteus — до ClickHouse.

    pip install sqlglot sqlparse jinja2 pyyaml       # chdb не нужен
    python3 stand/parse.py                           # sqlglot, какой установлен
    PYTHONPATH=<каталог sqlglot N> python3 stand/parse.py   # другая версия (проверено 23–30)

Proteus (форк Superset) при сохранении виртуального датасета и на каждом запросе чарта
разбирает отрендеренный SQL: sqlglot диалектом clickhouse (Superset 4.1+) и проверкой «только
SELECT» (sqlparse у 4.0, sqlglot у 4.1+). Чего парсер не знает, падает ещё до ClickHouse:
«Некорректный SQL запрос: →…←», хотя ClickHouse и стенд chdb такой запрос выполняют. Так 29.09
упало сохранение датасета на `GROUP BY intDiv(rn - 1, 500) AS ch` — алиас в GROUP BY.

Варианты: оба режима × сохранение (AlwaysTrue), открытие под всеми логинами мира, все части
ответа, все фильтры, серверная сортировка по скрытому полю, поиск и дети узла по каждому
дереву, значения атрибута, враждебный ввод — как есть и в обёртке Proteus
(SELECT измерений FROM (датасет) AS virtual_table GROUP BY … LIMIT).
Код выхода 0 — всё разобралось; 1 — список вариантов с местом ошибки.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ch  # noqa: E402

import sqlglot  # noqa: E402
from sqlglot import exp  # noqa: E402

VARIANTS = {
    'сохранение': ({}, 'a.user', True),
    'открытие': ({}, 'a.user', False),
    'все части': ({'pt_f': ['r', 'f', 'mu', 'lu', 'kp']}, 'a.user', False),
    'все фильтры': ({'flt_f': ['office_desc=Офис 1', 'hrbp_login=hrbp.user1', 'regional_hr_login=hr.user2'],
                     'mu_f': ['1001', '1002'], 'lu_f': ['2001'], 'kp_f': ['A\x1fB'], 'id_f': ['rk=100001', 'login=a.b',
                     'tab=77', 'siebel=1-ABC'], 'per_f': ['date'], 'dt_f': ['2026-08-31'], 'emp_f': ['Активная'],
                     'tcr_f': ['ТЦР РФ'], 'sort_f': ['full_nm:desc'], 'lim_f': ['25000'],
                     'pt_f': ['r', 'f', 'mu', 'lu', 'kp']}, 'a.user', False),
    'сортировка по скрытому': ({'sort_f': ['grade:asc']}, 'a.user', False),
    'поиск УС': ({'pt_f': ['q'], 'q_f': ['mu=инвест']}, 'a.user', False),
    'поиск ЮС': ({'pt_f': ['q'], 'q_f': ['lu=инвест']}, 'a.user', False),
    'поиск КП': ({'pt_f': ['q'], 'q_f': ['kp=инвест']}, 'a.user', False),
    'дети УС': ({'pt_f': ['q'], 'q_f': ['mu>1001']}, 'a.user', False),
    'дети ЮС': ({'pt_f': ['q'], 'q_f': ['lu>2001']}, 'a.user', False),
    'дети КП': ({'pt_f': ['q'], 'q_f': ['kp>A\x1fB']}, 'a.user', False),
    'значения атрибута': ({'pt_f': ['q'], 'q_f': ['f:office_desc=Оф']}, 'a.user', False),
    'враждебный ввод': ({'flt_f': ["office_desc=O'Brien\\ --x", "city_nm=a'); DROP TABLE t; --"], 'q_f': ["mu=a'b\\c"],
                         'pt_f': ['r', 'f', 'q'], 'id_f': ["login=x'y", 'rk=12;DELETE'], 'sort_f': ['drop table:asc'],
                         'lim_f': ['777'], 'dt_f': ["2026-01-01'"], 'per_f': ['date']}, 'a.user', False),
}
USERS = ['hr.super', 'p.lead', 'an.a.sokolova', 'nobody']
MUTATING = ['Insert', 'Update', 'Delete', 'Merge', 'Create', 'Drop', 'TruncateTable', 'Alter']
WRAP = 'SELECT %s FROM (%%s) AS virtual_table GROUP BY %s LIMIT %d' % (
    ', '.join(ch.MEASURES), ', '.join(ch.MEASURES), ch.ROW_LIMIT)


def variants():
    for mode in ['us', 'kp']:
        for name, (flt, user, at) in VARIANTS.items():
            yield '%s: %s' % (mode, name), ch.sql(ch.carriers(flt, mode), user, mode, at)
        for user in USERS:
            yield '%s: открытие, %s' % (mode, user), ch.sql({}, user, mode, False)


def sqlglot_problem(text):
    """Как SQLScript / SQLStatement Superset 4.1+: один оператор, запрос, ничего не меняет."""
    try:
        st = [x for x in sqlglot.parse(text, dialect='clickhouse') if x is not None]
    except sqlglot.errors.ParseError as ex:
        e = ex.errors[0] if ex.errors else {}
        return '%s: …%s→%s←%s…' % (e.get('description', str(ex)[:120]), (e.get('start_context') or '')[-50:],
                                   e.get('highlight', ''), (e.get('end_context') or '')[:30])
    if len(st) != 1:
        return 'операторов: %d' % len(st)
    for nt in MUTATING:
        if hasattr(exp, nt) and st[0].find(getattr(exp, nt)):
            return 'изменяющий узел: ' + nt
    if not isinstance(st[0], (exp.Select, exp.Union, exp.Subquery)):
        return 'не запрос: ' + type(st[0]).__name__
    return ''


def sqlparse_problem(text):
    """Как ParsedQuery.is_select Superset 4.0: только SELECT, ни DDL, ни DML кроме SELECT."""
    try:
        import sqlparse
        from sqlparse.tokens import DDL, DML
    except ImportError:
        return ''
    seen = False
    for st in sqlparse.parse(sqlparse.format(text, strip_comments=True)):
        toks = list(st.flatten())
        if any(t.ttype == DDL for t in toks) or any(t.ttype == DML and t.normalized != 'SELECT' for t in toks):
            return 'DDL / DML не SELECT'
        if st.get_type() == 'SELECT':
            seen = True
        elif st.get_type() != 'UNKNOWN':
            return 'оператор ' + st.get_type()
    return '' if seen else 'нет SELECT'


if __name__ == '__main__':
    bad, n = [], 0
    for name, text in variants():
        for how, q in (('как есть', text), ('в обёртке', WRAP % text)):
            n += 1
            p = sqlglot_problem(q) or sqlparse_problem(q)
            if p:
                bad.append('%s (%s): %s' % (name, how, p))
    print('sqlglot %s: %d разборов, ошибок: %d' % (sqlglot.__version__, n, len(bad)))
    for b in bad:
        print('  ✗ ' + b)
    sys.exit(1 if bad else 0)
