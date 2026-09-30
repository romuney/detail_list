"""Моки для smoke скилла: ответы датасетов чарта списка и панели фильтров.

    python3 stand/mock.py        # proteus/detail-list.mock.json и proteus/detail-list-filters.mock.json
                                 # (live.py остановить: chdb держит каталог)

Пользователь a.user (частичный доступ — есть маски warden), вкладка us.
Список: десять колонок, 500 строк — одна пачка. Панель фильтров: куб 3 000 сотрудников (фильтр «Сотрудники
по списку») — словари, коды и деревья тех же сотрудников: smoke видит выпадашки с настоящими данными, мок не раздувается.
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ch  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = {'list': os.path.join(HERE, '..', 'proteus', 'detail-list.mock.json'),
       'filters': os.path.join(HERE, '..', 'proteus', 'detail-list-filters.mock.json')}
COLS = ['master_id', 'hiredate', 'full_nm', 'legal_position_nm', 'grade', 'office_desc', 'emp_stream_desc',
        'lvl3_mapped_management_unit_nm', 'lvl4_mapped_management_unit_nm', 'work_experience_year']

if __name__ == '__main__':
    ids = ch._run("SELECT toString(mdm_employee_rk) AS r FROM prod_proteus.mdm_employee_d_detail_last_day "
                  "WHERE legal_employee_flg = 1 ORDER BY cityHash64(mdm_employee_rk) LIMIT 3000")[0]
    for view, flt in [('list', {'cols_f': COLS}), ('filters', {'id_f': ['rk=' + r['r'] for r in ids]})]:
        rows, _ = ch.dataset(flt, 'a.user', 'us', view=view)
        out = []
        for r in rows:
            if r['role'] == 'r' and int(r['k']) > 0:
                continue
            out.append(r)
        json.dump(out, open(OUT[view], 'w', encoding='utf-8'), ensure_ascii=False)
        print('%s: %d строк, %.0f КБ' % (os.path.relpath(OUT[view]), len(out), os.path.getsize(OUT[view]) / 1024))
