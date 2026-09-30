"""Проверка на бою одним запросом: файл 10 поставки.

    python3 stand/diag.py            # собрать «10. Проверка на бою — один запрос.sql» из исходников
    <venv>/bin/python stand/diag.py --run [логин]   # то же и выполнить на стенде (chdb), напечатать ответ

Запрос — обычный ClickHouse SQL без Jinja (SQL Lab Proteus), один на всё. Ответ — строки «часть, метрика,
значение, пояснение»:
  1. источник: дата данных, строк и сотрудников, куб панели (юридическая или активная численность), КП;
  2. словари: сколько значений у каждого атрибута панели (ширина кода в кубе);
  3. деревья: узлов и листов УС / ЮС / КП;
  4. датасеты как есть — панель «Детальные списки» и списки обеих вкладок по умолчанию, отрисованные
     без фильтров для логина ваш_логин: по ролям — строк и байт ответа (base64 и коды — как в ответе
     Proteus). Время выполнения всего запроса SQL Lab показывает сам: это время трёх датасетов подряд
     плюс статистики.
Логин подставляет владелец (Ctrl+H «ваш_логин»): от него — доступ warden, как у чарта.
"""
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ch  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, 'Поставка — Детальные списки', '10. Проверка на бою — один запрос.sql')
LOGIN = 'ваш_логин'
T = 'prod_proteus.mdm_employee_d_detail_last_day'
TK = 'prod_proteus.mdm_employee_d_detail_last_day_functional'
CUBE_WHERE = '(legal_employee_flg = 1 OR active_employee_flg = 1)'


def jinja_list(src, name):
    m = re.search(r"\{% set " + name + r" = \[(.*?)\]", src, re.S)
    return re.findall(r"'([a-z0-9_]+)'", m.group(1))


def build():
    src = open(ch.DATASET, encoding='utf-8').read()
    facets = [a for a in jinja_list(src, 'FACETS') if a != 'regional_hr_login']
    pairs = ', '.join("('%s', ifNull(toString(%s), ''))" % (a, a) for a in facets)
    mu = 'arrayFilter(x -> x != \'\', [%s])' % ', '.join("ifNull(lvl%d_mapped_management_unit_rk, '')" % i for i in range(3, 13))
    lu = 'arrayFilter(x -> x != \'\', [%s])' % ', '.join("ifNull(lvl%d_legal_unit_rk, '')" % i for i in range(1, 8))
    kp_levels = ("arrayMap(x -> arrayFilter(y -> y != '' AND y != '-', arraySlice(splitByString('<>', x), 1, 12)), "
                 "splitByString(';', ifNull(functional_lvl_all_array, '')))")
    parts = []
    # 1. источник
    parts.append("""  SELECT '1 источник' AS part, 'дата данных (last_day)' AS metric, toString(max(business_dt)) AS value, 'свежесть' AS note FROM %s""" % T)
    parts.append("""  SELECT '1 источник', 'last_day: строк / сотрудников', concat(toString(count()), ' / ', toString(uniqExact(mdm_employee_rk))), 'строк больше сотрудников — дубли' FROM %s""" % T)
    parts.append("""  SELECT '1 источник', 'куб панели: сотрудников (юр. или активная)', toString(countIf(%s)), 'N куба: строк кодов на атрибут' FROM %s""" % (CUBE_WHERE, T))
    parts.append("""  SELECT '1 источник', 'список по умолчанию: юридическая численность', toString(countIf(legal_employee_flg = 1)), 'итог списка без фильтров' FROM %s""" % T)
    parts.append("""  SELECT '1 источник', 'КП: строк аллокаций / сотрудников', concat(toString(count()), ' / ', toString(uniqExact(mdm_employee_rk))), 'вкладка КП' FROM %s WHERE %s""" % (TK, CUBE_WHERE))
    parts.append("""  SELECT '1 источник', 'дат в «Периоде»', toString(uniqExact(toDate(business_dt_detail))), 'список дат панели' FROM prod_proteus.mdm_employee_d_business_dt_detail""")
    # 2. словари
    parts.append("""  SELECT '2 словари', kv.1, toString(uniqExact(kv.2)), concat('ширина кода ', toString(multiIf(uniqExact(kv.2) <= 64, 1, uniqExact(kv.2) <= 4096, 2, 3)))
  FROM (SELECT arrayJoin([%s]) AS kv FROM %s WHERE %s) GROUP BY kv.1""" % (pairs, T, CUBE_WHERE))
    parts.append("""  SELECT '2 словари', 'regional_hr_login', toString(uniqExact(x)), 'логинов рег. HR (несколько у сотрудника)'
  FROM (SELECT arrayJoin(if(empty(login_reg_hr_list), ['-'], login_reg_hr_list)) AS x FROM %s WHERE %s)""" % (T, CUBE_WHERE))
    # 3. деревья
    for tk, arr in [('УС', mu), ('ЮС', lu)]:
        parts.append("""  SELECT '3 деревья', '%s: узлов / листов', concat(toString(uniqExact(pth)), ' / ', toString(uniqExactIf(pth, lf))), 'дерево целиком в ответе панели'
  FROM (SELECT arrayJoin(arrayMap(i -> (arraySlice(a, 1, i), i = length(a)), range(1, length(a) + 1))) AS t, t.1 AS pth, t.2 AS lf FROM (SELECT %s AS a FROM %s WHERE %s))""" % (tk, arr, T, CUBE_WHERE))
    parts.append("""  SELECT '3 деревья', 'КП: узлов / листов', concat(toString(uniqExact(pth)), ' / ', toString(uniqExactIf(pth, lf))), 'дерево целиком в ответе панели'
  FROM (SELECT arrayJoin(arrayFlatten(arrayMap(a -> arrayMap(i -> (arrayStringConcat(arraySlice(a, 1, i), char(31)), i = length(a)), range(1, length(a) + 1)), %s))) AS t,
    t.1 AS pth, t.2 AS lf FROM %s WHERE %s)""" % (kp_levels, T, CUBE_WHERE))
    # 4. датасеты как есть
    for tag, mode, view in [('панель', 'us', 'filters'), ('список', 'us', 'list'), ('список КП', 'kp', 'list')]:
        sql = ch.sql({}, LOGIN, mode, view=view).strip()
        parts.append("""  SELECT '4 датасет: %s', concat('роль ', role), concat(toString(count()), ' строк / ', toString(sum(length(j) + length(v) + length(k))), ' байт'), 'ответ датасета как есть'
  FROM (
%s
  ) GROUP BY role""" % (tag, sql))
    head = """-- «Детальные списки» — ПРОВЕРКА НА БОЮ ОДНИМ ЗАПРОСОМ (SQL Lab Proteus, база CROSS).
-- 1. Ctrl+H: «%s» → ваш логин (как в warden, строчными) — во всех местах.
-- 2. Выполнить целиком. Ответ — ~50 строк «часть · метрика · значение · пояснение».
-- 3. Прислать: ответ (скриншот или CSV) и ВРЕМЯ выполнения, которое показал SQL Lab.
-- Запрос только читает; части 1–3 — статистика источника, часть 4 — три наших датасета (панель,
-- списки двух вкладок) без фильтров, свёрнутые до «роль → строк, байт». Собран stand/diag.py из
-- proteus/detail-list.data.sql — править руками не нужно.
""" % LOGIN
    body = 'SELECT part, metric, value, note FROM (\n' + '\n  UNION ALL\n'.join(parts) + '\n)\nORDER BY part, metric\n'
    return head + body


def main():
    text = build()
    open(OUT, 'w', encoding='utf-8').write(text)
    print('%s: %.0f КБ' % (os.path.relpath(OUT, ROOT), len(text.encode('utf-8')) / 1024))
    if '--run' in sys.argv:
        user = sys.argv[sys.argv.index('--run') + 1] if len(sys.argv) > sys.argv.index('--run') + 1 else 'a.user'
        import time
        t0 = time.time()
        rows, _ = ch._run(ch.stand_sql(text.replace(LOGIN, user)))
        print('стенд: %.1f с' % (time.time() - t0))
        for r in rows:
            print('%-22s %-48s %-28s %s' % (r['part'], r['metric'], r['value'], r['note']))


if __name__ == '__main__':
    main()
