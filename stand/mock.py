"""Моки для smoke скилла: ответы датасетов чарта списка и панели фильтров.

    python3 stand/mock.py        # proteus/detail-list.mock.json и proteus/detail-list-filters.mock.json
                                 # (live.py остановить: chdb держит каталог)

Пользователь a.user (частичный доступ — есть маски warden), вкладка us.
Список: десять колонок, 500 строк — одна пачка. Панель фильтров: куб на выборке ≈3 % сотрудников (стенд
подменяет вселенную куба в тексте SQL) — словари, коды и деревья тех же сотрудников: smoke видит выпадашки с
настоящими данными, мок не раздувается.
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
    src = ch.source
    cut = "      WHERE warden_n > 0\n{%- endmacro %}"

    def sample(mode='us'):
        text = src(mode)
        assert text.count(cut) == 1
        return text.replace(cut, "      WHERE warden_n > 0 AND cityHash64(mdm_employee_rk) % 33 = 0\n{%- endmacro %}")
    for view, flt in [('list', {'cols_f': COLS}), ('filters', {})]:
        ch.source = sample if view == 'filters' else src
        rows, _ = ch.dataset(flt, 'a.user', 'us', view=view)
        out = []
        for r in rows:
            if r['role'] == 'r' and int(r['k']) > 0:
                continue
            out.append(r)
        json.dump(out, open(OUT[view], 'w', encoding='utf-8'), ensure_ascii=False)
        print('%s: %d строк, %.0f КБ' % (os.path.relpath(OUT[view]), len(out), os.path.getsize(OUT[view]) / 1024))
