-- «Детальные списки» — ПРОВЕРКА НА БОЮ ОДНИМ ЗАПРОСОМ (SQL Lab Proteus, база CROSS).
-- 1. Ctrl+H: «ваш_логин» → ваш логин (как в warden, строчными) — во всех местах.
-- 2. Выполнить целиком. Ответ — ~50 строк «часть · метрика · значение · пояснение».
-- 3. Прислать: ответ (скриншот или CSV) и ВРЕМЯ выполнения, которое показал SQL Lab.
-- Запрос только читает; части 1–3 — статистика источника, часть 4 — три наших датасета (панель,
-- списки двух вкладок) без фильтров, свёрнутые до «роль → строк, байт». Собран stand/diag.py из
-- proteus/detail-list.data.sql — править руками не нужно.
SELECT part, metric, value, note FROM (
  SELECT '1 источник' AS part, 'дата данных (last_day)' AS metric, toString(max(business_dt)) AS value, 'свежесть' AS note FROM prod_proteus.mdm_employee_d_detail_last_day
  UNION ALL
  SELECT '1 источник', 'last_day: строк / сотрудников', concat(toString(count()), ' / ', toString(uniqExact(mdm_employee_rk))), 'строк больше сотрудников — дубли' FROM prod_proteus.mdm_employee_d_detail_last_day
  UNION ALL
  SELECT '1 источник', 'куб панели: сотрудников (юр. или активная)', toString(countIf((legal_employee_flg = 1 OR active_employee_flg = 1))), 'N куба: строк кодов на атрибут' FROM prod_proteus.mdm_employee_d_detail_last_day
  UNION ALL
  SELECT '1 источник', 'список по умолчанию: юридическая численность', toString(countIf(legal_employee_flg = 1)), 'итог списка без фильтров' FROM prod_proteus.mdm_employee_d_detail_last_day
  UNION ALL
  SELECT '1 источник', 'КП: строк аллокаций / сотрудников', concat(toString(count()), ' / ', toString(uniqExact(mdm_employee_rk))), 'вкладка КП' FROM prod_proteus.mdm_employee_d_detail_last_day_functional WHERE (legal_employee_flg = 1 OR active_employee_flg = 1)
  UNION ALL
  SELECT '1 источник', 'дат в «Периоде»', toString(uniqExact(toDate(business_dt_detail))), 'список дат панели' FROM prod_proteus.mdm_employee_d_business_dt_detail
  UNION ALL
  SELECT '2 словари', kv.1, toString(uniqExact(kv.2)), concat('ширина кода ', toString(multiIf(uniqExact(kv.2) <= 64, 1, uniqExact(kv.2) <= 4096, 2, 3)))
  FROM (SELECT arrayJoin([('active_type_nm', ifNull(toString(active_type_nm), '')), ('employment_relation_type_desc', ifNull(toString(employment_relation_type_desc), '')), ('employee_contract_type_desc', ifNull(toString(employee_contract_type_desc), '')), ('employee_main_contract_type_nm', ifNull(toString(employee_main_contract_type_nm), '')), ('residential_state_nm', ifNull(toString(residential_state_nm), '')), ('office_desc', ifNull(toString(office_desc), '')), ('emp_specialization_oper_code', ifNull(toString(emp_specialization_oper_code), '')), ('emp_specialization_it_code', ifNull(toString(emp_specialization_it_code), '')), ('emp_stream_desc', ifNull(toString(emp_stream_desc), '')), ('emp_specialization_desc', ifNull(toString(emp_specialization_desc), '')), ('management_head_flg', ifNull(toString(management_head_flg), '')), ('head_lvl_segment', ifNull(toString(head_lvl_segment), '')), ('subordination_lvl', ifNull(toString(subordination_lvl), '')), ('hrbp_login', ifNull(toString(hrbp_login), '')), ('legal_position_nm', ifNull(toString(legal_position_nm), '')), ('mapping_channel_name', ifNull(toString(mapping_channel_name), '')), ('respond_source_nm', ifNull(toString(respond_source_nm), '')), ('location_type', ifNull(toString(location_type), '')), ('macroregion_nm', ifNull(toString(macroregion_nm), '')), ('city_nm', ifNull(toString(city_nm), '')), ('tcr_exist_flg', ifNull(toString(tcr_exist_flg), '')), ('t_education_desc', ifNull(toString(t_education_desc), '')), ('company_fire_flg', ifNull(toString(company_fire_flg), '')), ('rb_flg', ifNull(toString(rb_flg), '')), ('rb_migration_flg', ifNull(toString(rb_migration_flg), ''))]) AS kv FROM prod_proteus.mdm_employee_d_detail_last_day WHERE (legal_employee_flg = 1 OR active_employee_flg = 1)) GROUP BY kv.1
  UNION ALL
  SELECT '2 словари', 'regional_hr_login', toString(uniqExact(x)), 'логинов рег. HR (несколько у сотрудника)'
  FROM (SELECT arrayJoin(if(empty(login_reg_hr_list), ['-'], login_reg_hr_list)) AS x FROM prod_proteus.mdm_employee_d_detail_last_day WHERE (legal_employee_flg = 1 OR active_employee_flg = 1))
  UNION ALL
  SELECT '3 деревья', 'УС: узлов / листов', concat(toString(uniqExact(pth)), ' / ', toString(uniqExactIf(pth, lf))), 'дерево целиком в ответе панели'
  FROM (SELECT arrayJoin(arrayMap(i -> (arraySlice(a, 1, i), i = length(a)), range(1, length(a) + 1))) AS t, t.1 AS pth, t.2 AS lf FROM (SELECT arrayFilter(x -> x != '', [ifNull(lvl3_mapped_management_unit_rk, ''), ifNull(lvl4_mapped_management_unit_rk, ''), ifNull(lvl5_mapped_management_unit_rk, ''), ifNull(lvl6_mapped_management_unit_rk, ''), ifNull(lvl7_mapped_management_unit_rk, ''), ifNull(lvl8_mapped_management_unit_rk, ''), ifNull(lvl9_mapped_management_unit_rk, ''), ifNull(lvl10_mapped_management_unit_rk, ''), ifNull(lvl11_mapped_management_unit_rk, ''), ifNull(lvl12_mapped_management_unit_rk, '')]) AS a FROM prod_proteus.mdm_employee_d_detail_last_day WHERE (legal_employee_flg = 1 OR active_employee_flg = 1)))
  UNION ALL
  SELECT '3 деревья', 'ЮС: узлов / листов', concat(toString(uniqExact(pth)), ' / ', toString(uniqExactIf(pth, lf))), 'дерево целиком в ответе панели'
  FROM (SELECT arrayJoin(arrayMap(i -> (arraySlice(a, 1, i), i = length(a)), range(1, length(a) + 1))) AS t, t.1 AS pth, t.2 AS lf FROM (SELECT arrayFilter(x -> x != '', [ifNull(lvl1_legal_unit_rk, ''), ifNull(lvl2_legal_unit_rk, ''), ifNull(lvl3_legal_unit_rk, ''), ifNull(lvl4_legal_unit_rk, ''), ifNull(lvl5_legal_unit_rk, ''), ifNull(lvl6_legal_unit_rk, ''), ifNull(lvl7_legal_unit_rk, '')]) AS a FROM prod_proteus.mdm_employee_d_detail_last_day WHERE (legal_employee_flg = 1 OR active_employee_flg = 1)))
  UNION ALL
  SELECT '3 деревья', 'КП: узлов / листов', concat(toString(uniqExact(pth)), ' / ', toString(uniqExactIf(pth, lf))), 'дерево целиком в ответе панели'
  FROM (SELECT arrayJoin(arrayFlatten(arrayMap(a -> arrayMap(i -> (arrayStringConcat(arraySlice(a, 1, i), char(31)), i = length(a)), range(1, length(a) + 1)), arrayMap(x -> arrayFilter(y -> y != '' AND y != '-', arraySlice(splitByString('<>', x), 1, 12)), splitByString(';', ifNull(functional_lvl_all_array, '')))))) AS t,
    t.1 AS pth, t.2 AS lf FROM prod_proteus.mdm_employee_d_detail_last_day WHERE (legal_employee_flg = 1 OR active_employee_flg = 1))
  UNION ALL
  SELECT '4 датасет: панель', concat('роль ', role), concat(toString(count()), ' строк / ', toString(sum(length(j) + length(v) + length(k))), ' байт'), 'ответ датасета как есть'
  FROM (
WITH
  arrayElement((
    SELECT groupArray((mdm_employee_rk, ad_login, first_nm, management_unit_nm, warden_cross_data_flg,
      personal_management_unit_rk_list, personal_exception_management_unit_rk_list, personal_legal_unit_rk_list,
      personal_functional_unit_rk_list, personal_exception_mdm_employee_rk_list,
      grade_management_unit_rk_list, grade_exception_management_unit_rk_list, grade_legal_unit_rk_list,
      grade_functional_unit_rk_list, grade_exception_mdm_employee_rk_list,
      seniority_management_unit_rk_list, seniority_exception_management_unit_rk_list, seniority_legal_unit_rk_list,
      seniority_exception_mdm_employee_rk_list,
      review_management_unit_rk_list, review_exception_management_unit_rk_list, review_legal_unit_rk_list,
      review_functional_unit_rk_list, review_exception_mdm_employee_rk_list,
      warden_support_gph_flg, profession_array_nm))
    FROM prod_proteus.warden_access_array_cross
    WHERE ad_login = 'ваш_логин'
  ), 1) AS warden_array,
  (SELECT count() FROM prod_proteus.warden_access_array_cross WHERE ad_login = 'ваш_логин') AS warden_n,
  CAST([], 'Array(String)') AS dl_mu, CAST([], 'Array(String)') AS dl_lu, CAST([], 'Array(String)') AS dl_kp
SELECT ifNull(role, '') AS role, ifNull(k, '') AS k, ifNull(v, '') AS v, toInt64(ifNull(n, 0)) AS n, ifNull(j, '') AS j
FROM (
  
  SELECT 'meta' AS role, 'us' AS k, '' AS v, toInt64(if(warden_n > 0, countIf(1), 0)) AS n,
    concat('{"m":', toJSONString(map(
        'ver', '3', 'mode', 'us', 'view', 'filters', 'cf', '_f', 'ok', toString(warden_n > 0), 'first_nm', ifNull(toString(warden_array.3), ''),
        'total', toString(if(warden_n > 0, countIf(1), 0)), 'all', toString(if(warden_n > 0, count(), 0)),
        'data_dt', ifNull(toString(max(business_dt)), ''), 'per', 'last', 'dt', '', 'emp', 'Юридическая',
        'tcr', '', 'sort', 'master_id:asc', 'lim', '5000', 'chunk', '500',
        'cube_chunk', '25000', 'alph', '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_',
        'rq', '', 'frq', '')),
      ',"a":', toJSONString(map('flt', CAST([], 'Array(String)'), 'mu', CAST([], 'Array(String)'), 'lu', CAST([], 'Array(String)'), 'kp', CAST([], 'Array(String)'),
        'id', CAST([], 'Array(String)'), 'cols', ['master_id', 'hiredate', 'my_link', 'full_nm', 'birth_dt', 'mdm_employee_age', 'age_generation_nm', 'company_fire_dt', 'work_experience_year', 'contact_main_phone_no', 'prs_email_address_txt', 'registration_state_nm', 'registration_city_nm', 'registration_full_address_txt', 'residential_state_nm', 'city_nm', 'residential_full_address_txt', 'doc_city_nm', 'education_degree_unique_max', 'education_spec_nm', 'office_desc', 'ad_login', 'wrk_email_address_txt', 'active_type_nm', 'employment_relation_type_desc', 'employee_status_desc', 'employee_contract_type_desc', 'regional_hr_login', 'employee_main_contract_type_nm', 'employee_main_contract_end_dt', 'legal_position_nm', 'lvl3_mapped_management_unit_nm', 'lvl4_mapped_management_unit_nm', 'lvl5_mapped_management_unit_nm', 'lvl6_mapped_management_unit_nm', 'lvl7_mapped_management_unit_nm', 'lvl8_mapped_management_unit_nm', 'lvl9_mapped_management_unit_nm', 'lvl10_mapped_management_unit_nm', 'lvl11_mapped_management_unit_nm', 'mapped_management_unit_nm', 'subordination_lvl', 'emp_specialization_oper_code', 'emp_specialization_it_code', 'emp_stream_desc', 'emp_specialization_desc', 'management_head_flg', 'head_lvl_segment', 'management_head_nm', 'head_login', 'hrbp_nm', 'hrbp_login', 'hrap_login', 'change_management_unit_dt_text', 'change_management_head_dt', 'change_specialization_dt_text', 'has_children_flg'], 'pt', ['cube'])),
      ',"dates":', toJSONString((SELECT groupArray(d) FROM (SELECT DISTINCT toString(toDate(business_dt_detail)) AS d
        FROM prod_proteus.mdm_employee_d_business_dt_detail WHERE business_dt_detail IS NOT NULL ORDER BY d DESC LIMIT 400))),
      '}') AS j
  FROM prod_proteus.mdm_employee_d_detail_last_day PREWHERE legal_employee_flg = 1

  UNION ALL
  
  SELECT 'D' AS role, fk AS k, toString(count()) AS v, toInt64(count()) AS n,
    base64Encode(arrayStringConcat(arrayMap(x -> replaceAll(replaceAll(replaceAll(x, '\\', '\\\\'), '\n', '\\n'), char(13), '\\r'), arraySort(groupArray(fv))), '\n')) AS j
  FROM (
    SELECT kv.1 AS fk, kv.2 AS fv
    FROM (
      SELECT arrayJoin(arrayConcat([('active_type_nm', ifNull(toString(active_type_nm), '')), ('employment_relation_type_desc', ifNull(toString(employment_relation_type_desc), '')), ('employee_contract_type_desc', ifNull(toString(employee_contract_type_desc), '')), ('employee_main_contract_type_nm', ifNull(toString(employee_main_contract_type_nm), '')), ('residential_state_nm', ifNull(toString(residential_state_nm), '')), ('office_desc', ifNull(toString(office_desc), '')), ('emp_specialization_oper_code', ifNull(toString(emp_specialization_oper_code), '')), ('emp_specialization_it_code', ifNull(toString(emp_specialization_it_code), '')), ('emp_stream_desc', ifNull(toString(emp_stream_desc), '')), ('emp_specialization_desc', ifNull(toString(emp_specialization_desc), '')), ('management_head_flg', ifNull(toString(management_head_flg), '')), ('head_lvl_segment', ifNull(toString(head_lvl_segment), '')), ('subordination_lvl', ifNull(toString(subordination_lvl), '')), ('hrbp_login', ifNull(toString(hrbp_login), '')), ('legal_position_nm', ifNull(toString(legal_position_nm), '')), ('mapping_channel_name', ifNull(toString(mapping_channel_name), '')), ('respond_source_nm', ifNull(toString(respond_source_nm), '')), ('location_type', ifNull(toString(location_type), '')), ('macroregion_nm', ifNull(toString(macroregion_nm), '')), ('city_nm', ifNull(toString(city_nm), '')), ('tcr_exist_flg', ifNull(toString(tcr_exist_flg), '')), ('t_education_desc', ifNull(toString(t_education_desc), '')), ('company_fire_flg', ifNull(toString(company_fire_flg), '')), ('rb_flg', ifNull(toString(rb_flg), '')), ('rb_migration_flg', ifNull(toString(rb_migration_flg), '')), ('emp', toString(ifNull(legal_employee_flg, 0) + 2 * ifNull(active_employee_flg, 0))),
('tcr', toString(ifNull(rus_tcr_flg, 0) + 2 * ifNull(foreign_tcr_flg, 0) + 4 * ifNull(tcr_flg, 0)))], arrayMap(x -> ('regional_hr_login', x), if(empty(login_reg_hr_list), ['-'], arrayDistinct(login_reg_hr_list))))) AS kv
      FROM (SELECT *, row_number() OVER (ORDER BY mdm_employee_rk) AS eo
      FROM prod_proteus.mdm_employee_d_detail_last_day PREWHERE (legal_employee_flg = 1 OR active_employee_flg = 1)
      WHERE warden_n > 0)
    )
    GROUP BY fk, fv
  )
  GROUP BY fk

  UNION ALL
  
  SELECT 'C' AS role, fk AS k, concat(toString(ck), ':', toString(any(w)), ':0') AS v, toInt64(count()) AS n,
    arrayStringConcat(arrayMap(x -> x.2, arraySort(x -> x.1, groupArray((eo, cs)))), '') AS j
  FROM (
    SELECT fk, eo, intDiv(eo - 1, 25000) AS ck, w, arrayStringConcat(arrayMap(i -> substring('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_', toUInt32(bitAnd(bitShiftRight(toUInt64(code), 6 * (w - i)), 63)) + 1, 1), range(1, w + 1)), '') AS cs
    FROM (
      SELECT fk, eo, code, multiIf(mx < 64, 1, mx < 4096, 2, mx < 262144, 3, 4) AS w
      FROM (
        SELECT fk, eo, dense_rank() OVER (PARTITION BY fk ORDER BY fv) - 1 AS code, uniqExact(fv) OVER (PARTITION BY fk) - 1 AS mx
        FROM (
          SELECT kv.1 AS fk, kv.2 AS fv, eo
          FROM (SELECT arrayJoin([('active_type_nm', ifNull(toString(active_type_nm), '')), ('employment_relation_type_desc', ifNull(toString(employment_relation_type_desc), '')), ('employee_contract_type_desc', ifNull(toString(employee_contract_type_desc), '')), ('employee_main_contract_type_nm', ifNull(toString(employee_main_contract_type_nm), '')), ('residential_state_nm', ifNull(toString(residential_state_nm), '')), ('office_desc', ifNull(toString(office_desc), '')), ('emp_specialization_oper_code', ifNull(toString(emp_specialization_oper_code), '')), ('emp_specialization_it_code', ifNull(toString(emp_specialization_it_code), '')), ('emp_stream_desc', ifNull(toString(emp_stream_desc), '')), ('emp_specialization_desc', ifNull(toString(emp_specialization_desc), '')), ('management_head_flg', ifNull(toString(management_head_flg), '')), ('head_lvl_segment', ifNull(toString(head_lvl_segment), '')), ('subordination_lvl', ifNull(toString(subordination_lvl), '')), ('hrbp_login', ifNull(toString(hrbp_login), '')), ('legal_position_nm', ifNull(toString(legal_position_nm), '')), ('mapping_channel_name', ifNull(toString(mapping_channel_name), '')), ('respond_source_nm', ifNull(toString(respond_source_nm), '')), ('location_type', ifNull(toString(location_type), '')), ('macroregion_nm', ifNull(toString(macroregion_nm), '')), ('city_nm', ifNull(toString(city_nm), '')), ('tcr_exist_flg', ifNull(toString(tcr_exist_flg), '')), ('t_education_desc', ifNull(toString(t_education_desc), '')), ('company_fire_flg', ifNull(toString(company_fire_flg), '')), ('rb_flg', ifNull(toString(rb_flg), '')), ('rb_migration_flg', ifNull(toString(rb_migration_flg), '')), ('emp', toString(ifNull(legal_employee_flg, 0) + 2 * ifNull(active_employee_flg, 0))),
('tcr', toString(ifNull(rus_tcr_flg, 0) + 2 * ifNull(foreign_tcr_flg, 0) + 4 * ifNull(tcr_flg, 0)))]) AS kv, eo FROM (SELECT *, row_number() OVER (ORDER BY mdm_employee_rk) AS eo
      FROM prod_proteus.mdm_employee_d_detail_last_day PREWHERE (legal_employee_flg = 1 OR active_employee_flg = 1)
      WHERE warden_n > 0))
        )
      )
    )
  )
  GROUP BY fk, ck

  UNION ALL
  
  SELECT 'C' AS role, 'regional_hr_login' AS k, concat(toString(ck), ':', toString(any(w)), ':1') AS v, toInt64(count()) AS n,
    arrayStringConcat(arrayMap(x -> x.2, arraySort(x -> x.1, groupArray((eo, cs)))), '.') AS j
  FROM (
    SELECT eo, intDiv(eo - 1, 25000) AS ck, w, arrayStringConcat(arrayMap(c -> arrayStringConcat(arrayMap(i -> substring('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_', toUInt32(bitAnd(bitShiftRight(toUInt64(c), 6 * (w - i)), 63)) + 1, 1), range(1, w + 1)), ''), cl), '') AS cs
    FROM (
      SELECT eo, any(w) AS w, arraySort(groupArray(code)) AS cl
      FROM (
        SELECT eo, code, multiIf(mx < 64, 1, mx < 4096, 2, mx < 262144, 3, 4) AS w
        FROM (
          SELECT eo, dense_rank() OVER (ORDER BY fv) - 1 AS code, uniqExact(fv) OVER () - 1 AS mx
          FROM (SELECT arrayJoin(if(empty(login_reg_hr_list), ['-'], arrayDistinct(login_reg_hr_list))) AS fv, eo FROM (SELECT *, row_number() OVER (ORDER BY mdm_employee_rk) AS eo
      FROM prod_proteus.mdm_employee_d_detail_last_day PREWHERE (legal_employee_flg = 1 OR active_employee_flg = 1)
      WHERE warden_n > 0))
        )
      )
      GROUP BY eo
    )
  )
  GROUP BY ck

  UNION ALL
  
  SELECT 'T' AS role, 'mu' AS k, concat(toString(tc), ':', toString(any(nodes))) AS v, toInt64(count()) AS n,
    base64Encode(arrayStringConcat(arrayMap(x -> x.2, arraySort(x -> x.1, groupArray((ix, line)))), '\n')) AS j
  FROM (
    SELECT intDiv(ix - 1, 2000) AS tc, ix, nodes, line
    FROM (
      SELECT row_number() OVER (ORDER BY tpath) AS ix, count() OVER () AS nodes,
        concat(tv, '\t', toString(td), '\t', toString(own), '\t', replaceRegexpAll(tnm, '[[:cntrl:]]', ' ')) AS line
      FROM (
        SELECT arraySlice(rks, 3, d - 3 + 1) AS tpath, any(rks[d]) AS tv, any(d) AS td, any(nms[d]) AS tnm, max(d = li) AS own
        FROM (
          SELECT rks, nms, arrayLastIndex(x -> x != '', rks) AS li
          FROM (SELECT [ifNull(lvl1_mapped_management_unit_rk, ''), ifNull(lvl2_mapped_management_unit_rk, ''), ifNull(lvl3_mapped_management_unit_rk, ''), ifNull(lvl4_mapped_management_unit_rk, ''), ifNull(lvl5_mapped_management_unit_rk, ''), ifNull(lvl6_mapped_management_unit_rk, ''), ifNull(lvl7_mapped_management_unit_rk, ''), ifNull(lvl8_mapped_management_unit_rk, ''), ifNull(lvl9_mapped_management_unit_rk, ''), ifNull(lvl10_mapped_management_unit_rk, ''), ifNull(lvl11_mapped_management_unit_rk, ''), ifNull(lvl12_mapped_management_unit_rk, '')] AS rks, ['', '', ifNull(lvl3_mapped_management_unit_nm, ''), ifNull(lvl4_mapped_management_unit_nm, ''), ifNull(lvl5_mapped_management_unit_nm, ''), ifNull(lvl6_mapped_management_unit_nm, ''), ifNull(lvl7_mapped_management_unit_nm, ''), ifNull(lvl8_mapped_management_unit_nm, ''), ifNull(lvl9_mapped_management_unit_nm, ''), ifNull(lvl10_mapped_management_unit_nm, ''), ifNull(lvl11_mapped_management_unit_nm, ''), ifNull(lvl12_mapped_management_unit_nm, '')] AS nms FROM (SELECT *, row_number() OVER (ORDER BY mdm_employee_rk) AS eo
      FROM prod_proteus.mdm_employee_d_detail_last_day PREWHERE (legal_employee_flg = 1 OR active_employee_flg = 1)
      WHERE warden_n > 0))
        )
        ARRAY JOIN arrayFilter(i -> rks[i] != '', range(3, 13)) AS d
        GROUP BY tpath
      )
    )
  )
  GROUP BY tc

  UNION ALL
  
  SELECT 'C' AS role, 'mu' AS k, concat(toString(ck), ':', toString(any(w)), ':0') AS v, toInt64(count()) AS n,
    arrayStringConcat(arrayMap(x -> x.2, arraySort(x -> x.1, groupArray((eo, cs)))), '') AS j
  FROM (
    SELECT eo, intDiv(eo - 1, 25000) AS ck, w, arrayStringConcat(arrayMap(i -> substring('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_', toUInt32(bitAnd(bitShiftRight(toUInt64(code), 6 * (w - i)), 63)) + 1, 1), range(1, w + 1)), '') AS cs
    FROM (
      SELECT eo, code, multiIf(max(code) OVER () < 64, 1, max(code) OVER () < 4096, 2, max(code) OVER () < 262144, 3, 4) AS w
      FROM (
        SELECT eo, if(empty(lp), 0, dense_rank() OVER (ORDER BY lp) - max(empty(lp)) OVER ()) AS code
        FROM (
          SELECT eo, if(li >= 3, arraySlice(rks, 3, li - 3 + 1), CAST([], 'Array(String)')) AS lp
          FROM (SELECT eo, rks, arrayLastIndex(x -> x != '', rks) AS li FROM (SELECT eo, [ifNull(lvl1_mapped_management_unit_rk, ''), ifNull(lvl2_mapped_management_unit_rk, ''), ifNull(lvl3_mapped_management_unit_rk, ''), ifNull(lvl4_mapped_management_unit_rk, ''), ifNull(lvl5_mapped_management_unit_rk, ''), ifNull(lvl6_mapped_management_unit_rk, ''), ifNull(lvl7_mapped_management_unit_rk, ''), ifNull(lvl8_mapped_management_unit_rk, ''), ifNull(lvl9_mapped_management_unit_rk, ''), ifNull(lvl10_mapped_management_unit_rk, ''), ifNull(lvl11_mapped_management_unit_rk, ''), ifNull(lvl12_mapped_management_unit_rk, '')] AS rks FROM (SELECT *, row_number() OVER (ORDER BY mdm_employee_rk) AS eo
      FROM prod_proteus.mdm_employee_d_detail_last_day PREWHERE (legal_employee_flg = 1 OR active_employee_flg = 1)
      WHERE warden_n > 0)))
        )
      )
    )
  )
  GROUP BY ck

  UNION ALL
  
  SELECT 'T' AS role, 'lu' AS k, concat(toString(tc), ':', toString(any(nodes))) AS v, toInt64(count()) AS n,
    base64Encode(arrayStringConcat(arrayMap(x -> x.2, arraySort(x -> x.1, groupArray((ix, line)))), '\n')) AS j
  FROM (
    SELECT intDiv(ix - 1, 2000) AS tc, ix, nodes, line
    FROM (
      SELECT row_number() OVER (ORDER BY tpath) AS ix, count() OVER () AS nodes,
        concat(tv, '\t', toString(td), '\t', toString(own), '\t', replaceRegexpAll(tnm, '[[:cntrl:]]', ' ')) AS line
      FROM (
        SELECT arraySlice(rks, 1, d - 1 + 1) AS tpath, any(rks[d]) AS tv, any(d) AS td, any(nms[d]) AS tnm, max(d = li) AS own
        FROM (
          SELECT rks, nms, arrayLastIndex(x -> x != '', rks) AS li
          FROM (SELECT [ifNull(lvl1_legal_unit_rk, ''), ifNull(lvl2_legal_unit_rk, ''), ifNull(lvl3_legal_unit_rk, ''), ifNull(lvl4_legal_unit_rk, ''), ifNull(lvl5_legal_unit_rk, ''), ifNull(lvl6_legal_unit_rk, ''), ifNull(lvl7_legal_unit_rk, '')] AS rks, [ifNull(lvl1_legal_unit_nm, ''), ifNull(lvl2_legal_unit_nm, ''), ifNull(lvl3_legal_unit_nm, ''), ifNull(lvl4_legal_unit_nm, ''), ifNull(lvl5_legal_unit_nm, ''), ifNull(lvl6_legal_unit_nm, ''), ifNull(lvl7_legal_unit_nm, '')] AS nms FROM (SELECT *, row_number() OVER (ORDER BY mdm_employee_rk) AS eo
      FROM prod_proteus.mdm_employee_d_detail_last_day PREWHERE (legal_employee_flg = 1 OR active_employee_flg = 1)
      WHERE warden_n > 0))
        )
        ARRAY JOIN arrayFilter(i -> rks[i] != '', range(1, 8)) AS d
        GROUP BY tpath
      )
    )
  )
  GROUP BY tc

  UNION ALL
  
  SELECT 'C' AS role, 'lu' AS k, concat(toString(ck), ':', toString(any(w)), ':0') AS v, toInt64(count()) AS n,
    arrayStringConcat(arrayMap(x -> x.2, arraySort(x -> x.1, groupArray((eo, cs)))), '') AS j
  FROM (
    SELECT eo, intDiv(eo - 1, 25000) AS ck, w, arrayStringConcat(arrayMap(i -> substring('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_', toUInt32(bitAnd(bitShiftRight(toUInt64(code), 6 * (w - i)), 63)) + 1, 1), range(1, w + 1)), '') AS cs
    FROM (
      SELECT eo, code, multiIf(max(code) OVER () < 64, 1, max(code) OVER () < 4096, 2, max(code) OVER () < 262144, 3, 4) AS w
      FROM (
        SELECT eo, if(empty(lp), 0, dense_rank() OVER (ORDER BY lp) - max(empty(lp)) OVER ()) AS code
        FROM (
          SELECT eo, if(li >= 1, arraySlice(rks, 1, li - 1 + 1), CAST([], 'Array(String)')) AS lp
          FROM (SELECT eo, rks, arrayLastIndex(x -> x != '', rks) AS li FROM (SELECT eo, [ifNull(lvl1_legal_unit_rk, ''), ifNull(lvl2_legal_unit_rk, ''), ifNull(lvl3_legal_unit_rk, ''), ifNull(lvl4_legal_unit_rk, ''), ifNull(lvl5_legal_unit_rk, ''), ifNull(lvl6_legal_unit_rk, ''), ifNull(lvl7_legal_unit_rk, '')] AS rks FROM (SELECT *, row_number() OVER (ORDER BY mdm_employee_rk) AS eo
      FROM prod_proteus.mdm_employee_d_detail_last_day PREWHERE (legal_employee_flg = 1 OR active_employee_flg = 1)
      WHERE warden_n > 0)))
        )
      )
    )
  )
  GROUP BY ck

  UNION ALL
  
  SELECT 'T' AS role, 'kp' AS k, concat(toString(tc), ':', toString(any(nodes))) AS v, toInt64(count()) AS n,
    base64Encode(arrayStringConcat(arrayMap(x -> x.2, arraySort(x -> x.1, groupArray((ix, line)))), '\n')) AS j
  FROM (
    SELECT intDiv(ix - 1, 2000) AS tc, ix, nodes, line
    FROM (
      SELECT row_number() OVER (ORDER BY kpath) AS ix, count() OVER () AS nodes,
        concat(toString(length(parts)), '\t', toString(own), '\t', replaceAll(replaceAll(parts[length(parts)], '\t', ' '), '\n', ' ')) AS line
      FROM (
        SELECT kt.1 AS kpath, any(splitByString(char(31), kt.1)) AS parts, max(kt.2) AS own
        FROM (SELECT arrayMap(p -> (p, has(lps, p)), kn) AS kts FROM (SELECT arrayDistinct(arrayFlatten(arrayMap(a -> arrayMap(i -> arrayStringConcat(arraySlice(a, 1, i), char(31)), range(1, length(a) + 1)), arrayMap(x -> arrayFilter(y -> y != '' AND y != '-', arraySlice(splitByString('<>', x), 1, 12)), splitByString(';', ifNull(functional_lvl_all_array, '')))))) AS kn, arrayFilter(p -> p != '', arrayMap(a -> arrayStringConcat(a, char(31)), arrayMap(x -> arrayFilter(y -> y != '' AND y != '-', arraySlice(splitByString('<>', x), 1, 12)), splitByString(';', ifNull(functional_lvl_all_array, ''))))) AS lps FROM (SELECT *, row_number() OVER (ORDER BY mdm_employee_rk) AS eo
      FROM prod_proteus.mdm_employee_d_detail_last_day PREWHERE (legal_employee_flg = 1 OR active_employee_flg = 1)
      WHERE warden_n > 0)))
        ARRAY JOIN kts AS kt
        GROUP BY kpath
      )
    )
  )
  GROUP BY tc

  UNION ALL
  
  SELECT 'C' AS role, 'kp' AS k, concat(toString(ck), ':', toString(any(w)), ':1') AS v, toInt64(count()) AS n,
    arrayStringConcat(arrayMap(x -> x.2, arraySort(x -> x.1, groupArray((eo, cs)))), '.') AS j
  FROM (
    SELECT eo, intDiv(eo - 1, 25000) AS ck, w, arrayStringConcat(arrayMap(c -> arrayStringConcat(arrayMap(i -> substring('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_', toUInt32(bitAnd(bitShiftRight(toUInt64(c), 6 * (w - i)), 63)) + 1, 1), range(1, w + 1)), ''), cl), '') AS cs
    FROM (
      SELECT eo, any(w) AS w, arrayFilter(c -> c > 0, arraySort(groupArray(code))) AS cl
      FROM (
        SELECT eo, code, multiIf(max(code) OVER () < 64, 1, max(code) OVER () < 4096, 2, max(code) OVER () < 262144, 3, 4) AS w
        FROM (
          SELECT eo, if(kpath = '', 0, dense_rank() OVER (ORDER BY kpath) - max(kpath = '') OVER ()) AS code
          FROM (SELECT eo, arrayJoin(if(empty(lps), [''], lps)) AS kpath FROM (SELECT eo, arrayDistinct(arrayFilter(p -> p != '', arrayMap(a -> arrayStringConcat(a, char(31)), arrayMap(x -> arrayFilter(y -> y != '' AND y != '-', arraySlice(splitByString('<>', x), 1, 12)), splitByString(';', ifNull(functional_lvl_all_array, '')))))) AS lps FROM (SELECT *, row_number() OVER (ORDER BY mdm_employee_rk) AS eo
      FROM prod_proteus.mdm_employee_d_detail_last_day PREWHERE (legal_employee_flg = 1 OR active_employee_flg = 1)
      WHERE warden_n > 0)))
        )
      )
      GROUP BY eo
    )
  )
  GROUP BY ck
)
  ) GROUP BY role
  UNION ALL
  SELECT '4 датасет: список', concat('роль ', role), concat(toString(count()), ' строк / ', toString(sum(length(j) + length(v) + length(k))), ' байт'), 'ответ датасета как есть'
  FROM (
WITH
  arrayElement((
    SELECT groupArray((mdm_employee_rk, ad_login, first_nm, management_unit_nm, warden_cross_data_flg,
      personal_management_unit_rk_list, personal_exception_management_unit_rk_list, personal_legal_unit_rk_list,
      personal_functional_unit_rk_list, personal_exception_mdm_employee_rk_list,
      grade_management_unit_rk_list, grade_exception_management_unit_rk_list, grade_legal_unit_rk_list,
      grade_functional_unit_rk_list, grade_exception_mdm_employee_rk_list,
      seniority_management_unit_rk_list, seniority_exception_management_unit_rk_list, seniority_legal_unit_rk_list,
      seniority_exception_mdm_employee_rk_list,
      review_management_unit_rk_list, review_exception_management_unit_rk_list, review_legal_unit_rk_list,
      review_functional_unit_rk_list, review_exception_mdm_employee_rk_list,
      warden_support_gph_flg, profession_array_nm))
    FROM prod_proteus.warden_access_array_cross
    WHERE ad_login = 'ваш_логин'
  ), 1) AS warden_array,
  (SELECT count() FROM prod_proteus.warden_access_array_cross WHERE ad_login = 'ваш_логин') AS warden_n,
  CAST([], 'Array(String)') AS dl_mu, CAST([], 'Array(String)') AS dl_lu, CAST([], 'Array(String)') AS dl_kp
SELECT ifNull(role, '') AS role, ifNull(k, '') AS k, ifNull(v, '') AS v, toInt64(ifNull(n, 0)) AS n, ifNull(j, '') AS j
FROM (
  
  SELECT 'meta' AS role, 'us' AS k, '' AS v, toInt64(if(warden_n > 0, countIf(1), 0)) AS n,
    concat('{"m":', toJSONString(map(
        'ver', '3', 'mode', 'us', 'view', 'list', 'cf', '_f', 'ok', toString(warden_n > 0), 'first_nm', ifNull(toString(warden_array.3), ''),
        'total', toString(if(warden_n > 0, countIf(1), 0)), 'all', toString(if(warden_n > 0, count(), 0)),
        'data_dt', ifNull(toString(max(business_dt)), ''), 'per', 'last', 'dt', '', 'emp', 'Юридическая',
        'tcr', '', 'sort', 'master_id:asc', 'lim', '5000', 'chunk', '500',
        'cube_chunk', '25000', 'alph', '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_',
        'rq', '', 'frq', '')),
      ',"a":', toJSONString(map('flt', CAST([], 'Array(String)'), 'mu', CAST([], 'Array(String)'), 'lu', CAST([], 'Array(String)'), 'kp', CAST([], 'Array(String)'),
        'id', CAST([], 'Array(String)'), 'cols', ['master_id', 'hiredate', 'my_link', 'full_nm', 'birth_dt', 'mdm_employee_age', 'age_generation_nm', 'company_fire_dt', 'work_experience_year', 'contact_main_phone_no', 'prs_email_address_txt', 'registration_state_nm', 'registration_city_nm', 'registration_full_address_txt', 'residential_state_nm', 'city_nm', 'residential_full_address_txt', 'doc_city_nm', 'education_degree_unique_max', 'education_spec_nm', 'office_desc', 'ad_login', 'wrk_email_address_txt', 'active_type_nm', 'employment_relation_type_desc', 'employee_status_desc', 'employee_contract_type_desc', 'regional_hr_login', 'employee_main_contract_type_nm', 'employee_main_contract_end_dt', 'legal_position_nm', 'lvl3_mapped_management_unit_nm', 'lvl4_mapped_management_unit_nm', 'lvl5_mapped_management_unit_nm', 'lvl6_mapped_management_unit_nm', 'lvl7_mapped_management_unit_nm', 'lvl8_mapped_management_unit_nm', 'lvl9_mapped_management_unit_nm', 'lvl10_mapped_management_unit_nm', 'lvl11_mapped_management_unit_nm', 'mapped_management_unit_nm', 'subordination_lvl', 'emp_specialization_oper_code', 'emp_specialization_it_code', 'emp_stream_desc', 'emp_specialization_desc', 'management_head_flg', 'head_lvl_segment', 'management_head_nm', 'head_login', 'hrbp_nm', 'hrbp_login', 'hrap_login', 'change_management_unit_dt_text', 'change_management_head_dt', 'change_specialization_dt_text', 'has_children_flg'], 'pt', ['r'])),
      '}') AS j
  FROM prod_proteus.mdm_employee_d_detail_last_day PREWHERE legal_employee_flg = 1

  UNION ALL
  
  SELECT 'r' AS role, toString(ch) AS k, '' AS v, toInt64(count()) AS n,
    base64Encode(arrayStringConcat(arrayMap(x -> x.2, arraySort(x -> x.1, groupArray((rn, line)))), '\n')) AS j
  FROM (
  SELECT intDiv(rn - 1, 500) AS ch, rn, line
  FROM (
    SELECT row_number() OVER (ORDER BY sk ASC NULLS LAST, mdm_employee_rk) AS rn, line
    FROM (
      SELECT mdm_employee_rk, mdm_employee_rk AS sk,
        concat(replaceRegexpAll(replaceAll(replaceAll(replaceAll(ifNull(toString(mdm_employee_rk), ''), unhex('E280A8'), ' '), unhex('E280A9'), ' '), unhex('EFBBBF'), ' '), '[[:cntrl:]]', ' '), '\t', replaceRegexpAll(replaceAll(replaceAll(replaceAll(ifNull(toString(company_hire_dt), ''), unhex('E280A8'), ' '), unhex('E280A9'), ' '), unhex('EFBBBF'), ' '), '[[:cntrl:]]', ' '), '\t', replaceRegexpAll(replaceAll(replaceAll(replaceAll(ifNull(toString(employee_link), ''), unhex('E280A8'), ' '), unhex('E280A9'), ' '), unhex('EFBBBF'), ' '), '[[:cntrl:]]', ' '), '\t', replaceRegexpAll(replaceAll(replaceAll(replaceAll(ifNull(toString(if(wpf = 1, full_nm, '⛔')), ''), unhex('E280A8'), ' '), unhex('E280A9'), ' '), unhex('EFBBBF'), ' '), '[[:cntrl:]]', ' '), '\t', replaceRegexpAll(replaceAll(replaceAll(replaceAll(ifNull(toString(if(wpf = 1, toDateTime64(birth_dt_text, 0), NULL)), ''), unhex('E280A8'), ' '), unhex('E280A9'), ' '), unhex('EFBBBF'), ' '), '[[:cntrl:]]', ' '), '\t', replaceRegexpAll(replaceAll(replaceAll(replaceAll(ifNull(toString(if(wpf = 1, toString(mdm_employee_age), '⛔')), ''), unhex('E280A8'), ' '), unhex('E280A9'), ' '), unhex('EFBBBF'), ' '), '[[:cntrl:]]', ' '), '\t', replaceRegexpAll(replaceAll(replaceAll(replaceAll(ifNull(toString(if(wpf = 1, age_generation_nm, '⛔')), ''), unhex('E280A8'), ' '), unhex('E280A9'), ' '), unhex('EFBBBF'), ' '), '[[:cntrl:]]', ' '), '\t', replaceRegexpAll(replaceAll(replaceAll(replaceAll(ifNull(toString(company_fire_dt), ''), unhex('E280A8'), ' '), unhex('E280A9'), ' '), unhex('EFBBBF'), ' '), '[[:cntrl:]]', ' '), '\t', replaceRegexpAll(replaceAll(replaceAll(replaceAll(ifNull(toString(work_experience_year), ''), unhex('E280A8'), ' '), unhex('E280A9'), ' '), unhex('EFBBBF'), ' '), '[[:cntrl:]]', ' '), '\t', replaceRegexpAll(replaceAll(replaceAll(replaceAll(ifNull(toString(if(wpf = 1, contact_main_phone_no, '⛔')), ''), unhex('E280A8'), ' '), unhex('E280A9'), ' '), unhex('EFBBBF'), ' '), '[[:cntrl:]]', ' '), '\t', replaceRegexpAll(replaceAll(replaceAll(replaceAll(ifNull(toString(if(wpf = 1, prs_email_address_txt, '⛔')), ''), unhex('E280A8'), ' '), unhex('E280A9'), ' '), unhex('EFBBBF'), ' '), '[[:cntrl:]]', ' '), '\t', replaceRegexpAll(replaceAll(replaceAll(replaceAll(ifNull(toString(if(wpf = 1, registration_state_nm, '⛔')), ''), unhex('E280A8'), ' '), unhex('E280A9'), ' '), unhex('EFBBBF'), ' '), '[[:cntrl:]]', ' '), '\t', replaceRegexpAll(replaceAll(replaceAll(replaceAll(ifNull(toString(if(wpf = 1, coalesce(registration_city_nm, registration_settlement_nm), '⛔')), ''), unhex('E280A8'), ' '), unhex('E280A9'), ' '), unhex('EFBBBF'), ' '), '[[:cntrl:]]', ' '), '\t', replaceRegexpAll(replaceAll(replaceAll(replaceAll(ifNull(toString(if(wpf = 1, registration_full_address_txt, '⛔')), ''), unhex('E280A8'), ' '), unhex('E280A9'), ' '), unhex('EFBBBF'), ' '), '[[:cntrl:]]', ' '), '\t', replaceRegexpAll(replaceAll(replaceAll(replaceAll(ifNull(toString(residential_state_nm), ''), unhex('E280A8'), ' '), unhex('E280A9'), ' '), unhex('EFBBBF'), ' '), '[[:cntrl:]]', ' '), '\t', replaceRegexpAll(replaceAll(replaceAll(replaceAll(ifNull(toString(city_nm), ''), unhex('E280A8'), ' '), unhex('E280A9'), ' '), unhex('EFBBBF'), ' '), '[[:cntrl:]]', ' '), '\t', replaceRegexpAll(replaceAll(replaceAll(replaceAll(ifNull(toString(if(wpf = 1, residential_full_address_txt, '⛔')), ''), unhex('E280A8'), ' '), unhex('E280A9'), ' '), unhex('EFBBBF'), ' '), '[[:cntrl:]]', ' '), '\t', replaceRegexpAll(replaceAll(replaceAll(replaceAll(ifNull(toString(doc_city_nm), ''), unhex('E280A8'), ' '), unhex('E280A9'), ' '), unhex('EFBBBF'), ' '), '[[:cntrl:]]', ' '), '\t', replaceRegexpAll(replaceAll(replaceAll(replaceAll(ifNull(toString(education_degree_unique_max), ''), unhex('E280A8'), ' '), unhex('E280A9'), ' '), unhex('EFBBBF'), ' '), '[[:cntrl:]]', ' '), '\t', replaceRegexpAll(replaceAll(replaceAll(replaceAll(ifNull(toString(education_spec_nm), ''), unhex('E280A8'), ' '), unhex('E280A9'), ' '), unhex('EFBBBF'), ' '), '[[:cntrl:]]', ' '), '\t', replaceRegexpAll(replaceAll(replaceAll(replaceAll(ifNull(toString(office_desc), ''), unhex('E280A8'), ' '), unhex('E280A9'), ' '), unhex('EFBBBF'), ' '), '[[:cntrl:]]', ' '), '\t', replaceRegexpAll(replaceAll(replaceAll(replaceAll(ifNull(toString(ad_login), ''), unhex('E280A8'), ' '), unhex('E280A9'), ' '), unhex('EFBBBF'), ' '), '[[:cntrl:]]', ' '), '\t', replaceRegexpAll(replaceAll(replaceAll(replaceAll(ifNull(toString(wrk_email_address_txt), ''), unhex('E280A8'), ' '), unhex('E280A9'), ' '), unhex('EFBBBF'), ' '), '[[:cntrl:]]', ' '), '\t', replaceRegexpAll(replaceAll(replaceAll(replaceAll(ifNull(toString(active_type_nm), ''), unhex('E280A8'), ' '), unhex('E280A9'), ' '), unhex('EFBBBF'), ' '), '[[:cntrl:]]', ' '), '\t', replaceRegexpAll(replaceAll(replaceAll(replaceAll(ifNull(toString(employment_relation_type_desc), ''), unhex('E280A8'), ' '), unhex('E280A9'), ' '), unhex('EFBBBF'), ' '), '[[:cntrl:]]', ' '), '\t', replaceRegexpAll(replaceAll(replaceAll(replaceAll(ifNull(toString(employee_status_desc), ''), unhex('E280A8'), ' '), unhex('E280A9'), ' '), unhex('EFBBBF'), ' '), '[[:cntrl:]]', ' '), '\t', replaceRegexpAll(replaceAll(replaceAll(replaceAll(ifNull(toString(employee_contract_type_desc), ''), unhex('E280A8'), ' '), unhex('E280A9'), ' '), unhex('EFBBBF'), ' '), '[[:cntrl:]]', ' '), '\t', replaceRegexpAll(replaceAll(replaceAll(replaceAll(ifNull(toString(regional_hr_login), ''), unhex('E280A8'), ' '), unhex('E280A9'), ' '), unhex('EFBBBF'), ' '), '[[:cntrl:]]', ' '), '\t', replaceRegexpAll(replaceAll(replaceAll(replaceAll(ifNull(toString(employee_main_contract_type_nm), ''), unhex('E280A8'), ' '), unhex('E280A9'), ' '), unhex('EFBBBF'), ' '), '[[:cntrl:]]', ' '), '\t', replaceRegexpAll(replaceAll(replaceAll(replaceAll(ifNull(toString(employee_main_contract_end_dt), ''), unhex('E280A8'), ' '), unhex('E280A9'), ' '), unhex('EFBBBF'), ' '), '[[:cntrl:]]', ' '), '\t', replaceRegexpAll(replaceAll(replaceAll(replaceAll(ifNull(toString(legal_position_nm), ''), unhex('E280A8'), ' '), unhex('E280A9'), ' '), unhex('EFBBBF'), ' '), '[[:cntrl:]]', ' '), '\t', replaceRegexpAll(replaceAll(replaceAll(replaceAll(ifNull(toString(lvl3_mapped_management_unit_nm), ''), unhex('E280A8'), ' '), unhex('E280A9'), ' '), unhex('EFBBBF'), ' '), '[[:cntrl:]]', ' '), '\t', replaceRegexpAll(replaceAll(replaceAll(replaceAll(ifNull(toString(lvl4_mapped_management_unit_nm), ''), unhex('E280A8'), ' '), unhex('E280A9'), ' '), unhex('EFBBBF'), ' '), '[[:cntrl:]]', ' '), '\t', replaceRegexpAll(replaceAll(replaceAll(replaceAll(ifNull(toString(lvl5_mapped_management_unit_nm), ''), unhex('E280A8'), ' '), unhex('E280A9'), ' '), unhex('EFBBBF'), ' '), '[[:cntrl:]]', ' '), '\t', replaceRegexpAll(replaceAll(replaceAll(replaceAll(ifNull(toString(lvl6_mapped_management_unit_nm), ''), unhex('E280A8'), ' '), unhex('E280A9'), ' '), unhex('EFBBBF'), ' '), '[[:cntrl:]]', ' '), '\t', replaceRegexpAll(replaceAll(replaceAll(replaceAll(ifNull(toString(lvl7_mapped_management_unit_nm), ''), unhex('E280A8'), ' '), unhex('E280A9'), ' '), unhex('EFBBBF'), ' '), '[[:cntrl:]]', ' '), '\t', replaceRegexpAll(replaceAll(replaceAll(replaceAll(ifNull(toString(lvl8_mapped_management_unit_nm), ''), unhex('E280A8'), ' '), unhex('E280A9'), ' '), unhex('EFBBBF'), ' '), '[[:cntrl:]]', ' '), '\t', replaceRegexpAll(replaceAll(replaceAll(replaceAll(ifNull(toString(lvl9_mapped_management_unit_nm), ''), unhex('E280A8'), ' '), unhex('E280A9'), ' '), unhex('EFBBBF'), ' '), '[[:cntrl:]]', ' '), '\t', replaceRegexpAll(replaceAll(replaceAll(replaceAll(ifNull(toString(lvl10_mapped_management_unit_nm), ''), unhex('E280A8'), ' '), unhex('E280A9'), ' '), unhex('EFBBBF'), ' '), '[[:cntrl:]]', ' '), '\t', replaceRegexpAll(replaceAll(replaceAll(replaceAll(ifNull(toString(lvl11_mapped_management_unit_nm), ''), unhex('E280A8'), ' '), unhex('E280A9'), ' '), unhex('EFBBBF'), ' '), '[[:cntrl:]]', ' '), '\t', replaceRegexpAll(replaceAll(replaceAll(replaceAll(ifNull(toString(mapped_management_unit_nm), ''), unhex('E280A8'), ' '), unhex('E280A9'), ' '), unhex('EFBBBF'), ' '), '[[:cntrl:]]', ' '), '\t', replaceRegexpAll(replaceAll(replaceAll(replaceAll(ifNull(toString(subordination_lvl), ''), unhex('E280A8'), ' '), unhex('E280A9'), ' '), unhex('EFBBBF'), ' '), '[[:cntrl:]]', ' '), '\t', replaceRegexpAll(replaceAll(replaceAll(replaceAll(ifNull(toString(emp_specialization_oper_code), ''), unhex('E280A8'), ' '), unhex('E280A9'), ' '), unhex('EFBBBF'), ' '), '[[:cntrl:]]', ' '), '\t', replaceRegexpAll(replaceAll(replaceAll(replaceAll(ifNull(toString(emp_specialization_it_code), ''), unhex('E280A8'), ' '), unhex('E280A9'), ' '), unhex('EFBBBF'), ' '), '[[:cntrl:]]', ' '), '\t', replaceRegexpAll(replaceAll(replaceAll(replaceAll(ifNull(toString(emp_stream_desc), ''), unhex('E280A8'), ' '), unhex('E280A9'), ' '), unhex('EFBBBF'), ' '), '[[:cntrl:]]', ' '), '\t', replaceRegexpAll(replaceAll(replaceAll(replaceAll(ifNull(toString(emp_specialization_desc), ''), unhex('E280A8'), ' '), unhex('E280A9'), ' '), unhex('EFBBBF'), ' '), '[[:cntrl:]]', ' '), '\t', replaceRegexpAll(replaceAll(replaceAll(replaceAll(ifNull(toString(management_head_flg), ''), unhex('E280A8'), ' '), unhex('E280A9'), ' '), unhex('EFBBBF'), ' '), '[[:cntrl:]]', ' '), '\t', replaceRegexpAll(replaceAll(replaceAll(replaceAll(ifNull(toString(head_lvl_segment), ''), unhex('E280A8'), ' '), unhex('E280A9'), ' '), unhex('EFBBBF'), ' '), '[[:cntrl:]]', ' '), '\t', replaceRegexpAll(replaceAll(replaceAll(replaceAll(ifNull(toString(if(wpf = 1, management_head_nm, '⛔')), ''), unhex('E280A8'), ' '), unhex('E280A9'), ' '), unhex('EFBBBF'), ' '), '[[:cntrl:]]', ' '), '\t', replaceRegexpAll(replaceAll(replaceAll(replaceAll(ifNull(toString(head_login), ''), unhex('E280A8'), ' '), unhex('E280A9'), ' '), unhex('EFBBBF'), ' '), '[[:cntrl:]]', ' '), '\t', replaceRegexpAll(replaceAll(replaceAll(replaceAll(ifNull(toString(if(wpf = 1, hrbp_nm, '⛔')), ''), unhex('E280A8'), ' '), unhex('E280A9'), ' '), unhex('EFBBBF'), ' '), '[[:cntrl:]]', ' '), '\t', replaceRegexpAll(replaceAll(replaceAll(replaceAll(ifNull(toString(hrbp_login), ''), unhex('E280A8'), ' '), unhex('E280A9'), ' '), unhex('EFBBBF'), ' '), '[[:cntrl:]]', ' '), '\t', replaceRegexpAll(replaceAll(replaceAll(replaceAll(ifNull(toString(hrap_login), ''), unhex('E280A8'), ' '), unhex('E280A9'), ' '), unhex('EFBBBF'), ' '), '[[:cntrl:]]', ' '), '\t', replaceRegexpAll(replaceAll(replaceAll(replaceAll(ifNull(toString(change_management_unit_dt_text), ''), unhex('E280A8'), ' '), unhex('E280A9'), ' '), unhex('EFBBBF'), ' '), '[[:cntrl:]]', ' '), '\t', replaceRegexpAll(replaceAll(replaceAll(replaceAll(ifNull(toString(change_management_head_dt), ''), unhex('E280A8'), ' '), unhex('E280A9'), ' '), unhex('EFBBBF'), ' '), '[[:cntrl:]]', ' '), '\t', replaceRegexpAll(replaceAll(replaceAll(replaceAll(ifNull(toString(change_specialization_dt_text), ''), unhex('E280A8'), ' '), unhex('E280A9'), ' '), unhex('EFBBBF'), ' '), '[[:cntrl:]]', ' '), '\t', replaceRegexpAll(replaceAll(replaceAll(replaceAll(ifNull(toString(if(wpf = 1, toString(has_children_flg), '⛔')), ''), unhex('E280A8'), ' '), unhex('E280A9'), ' '), unhex('EFBBBF'), ' '), '[[:cntrl:]]', ' ')) AS line
      FROM (SELECT *,
            if (
    warden_array.5=1
    or
      case when warden_array.2 in ('an.a.sokolova','r.dorofeev') then active_type_nm = 'Стажеры' else 1!=1 end --доступ в рамках задачи CROSS-8440 и CROSS-15151
    or
      case when warden_array.2 in ('v.larionova', 'a.tumanik','k.a.chernova','i.lelyuk', 'i.s.verbitskaya','k.samolyuk', 'e.tyazheva') then tcr_flg = 1 else 1!=1 end --доступ в рамках задачи CROSS-9940
    or
      case when warden_array.25 =1 then employment_relation_type_desc != 'Штатный сотрудник' else 1!=1 end --доступ для команды учета исполнителей
    or
    hasAny(warden_array.26, profession_nm_array_new) --варден для лидеров профессий
    or
    (hasAny([warden_array.2], login_reg_hr_list)
    and lvl3_mapped_management_unit_rk != 'c10fb1ad1295902238dba3019d92ce41')
      or
    (
    (
      (
      hasAny(warden_array.6, mapped_management_unit_rk_list)
      and (not hasAny(warden_array.7, mapped_management_unit_rk_list))
      )
    or
      (hasAny(warden_array.8, legal_unit_rk_list)
      )
    or
      (hasAny(warden_array.9, functional_unit_rk_list))
    )
    and (not hasAny(warden_array.10, mdm_employee_rk_list)))
    ,1,0) AS wpf,
            if (
    warden_array.5=1
    or
      hasAny(warden_array.26, profession_nm_array_new) --варден для лидеров профессий
    or
      case when warden_array.2 in ('v.larionova', 'a.tumanik','k.a.chernova','i.lelyuk', 'i.s.verbitskaya','k.samolyuk', 'e.tyazheva') then tcr_flg = 1 else 1!=1 end --доступ в рамках задачи CROSS-9940
            or
      warden_array.2 in ('v.poljakov') and v_poljakov_access_flg = 1 --доступ в рамках задачи CROSS-16526
            or
      (hasAny([warden_array.2], login_reg_hr_list)
      and lvl3_mapped_management_unit_rk != 'c10fb1ad1295902238dba3019d92ce41')
      or
      (
    (
      (
      hasAny(warden_array.11, mapped_management_unit_rk_list)
      and (not hasAny(warden_array.12, mapped_management_unit_rk_list))
      )
    or
      (hasAny(warden_array.13, legal_unit_rk_list)
      )
    or
      (hasAny(warden_array.14, functional_unit_rk_list))
    )
    and (not hasAny(warden_array.15, mdm_employee_rk_list)))
    ,1,0) AS wgf,
            if (
    warden_array.5=1
    or
      hasAny(warden_array.26, profession_nm_array_new) --варден для лидеров профессий
    or
       case when warden_array.2 in ('v.larionova', 'a.tumanik','k.a.chernova','i.lelyuk', 'i.s.verbitskaya','k.samolyuk', 'e.tyazheva') then tcr_flg = 1 else 1!=1 end --доступ в рамках задачи CROSS-9940
    or
      warden_array.2 in ('v.poljakov') and v_poljakov_access_flg = 1 --доступ в рамках задачи CROSS-16526
    or
    (hasAny([warden_array.2], login_reg_hr_list)
    and lvl3_mapped_management_unit_rk != 'c10fb1ad1295902238dba3019d92ce41')
      or
          ((
        (
        hasAny(warden_array.16, mapped_management_unit_rk_list)
        and (not hasAny(warden_array.17, mapped_management_unit_rk_list))
        )
      or
        (
        hasAny(warden_array.18, legal_unit_rk_list)
        )
        )
      and (not hasAny(warden_array.19, mdm_employee_rk_list)))
    ,1,0) AS wsf,
            if (
    warden_array.5=1
        or
    (hasAny([warden_array.2], login_reg_hr_list)
    and lvl3_mapped_management_unit_rk != 'c10fb1ad1295902238dba3019d92ce41')
      or
    (
    (
      (
      hasAny(warden_array.20, mapped_management_unit_rk_list)
      and (not hasAny(warden_array.21, mapped_management_unit_rk_list))
      )
    or
      (hasAny(warden_array.22, legal_unit_rk_list)
      )
    or
      (hasAny(warden_array.23, functional_unit_rk_list))
    )
    and (not hasAny(warden_array.24, mdm_employee_rk_list)))
    ,1,0) AS wrf
          FROM prod_proteus.mdm_employee_d_detail_last_day
          PREWHERE legal_employee_flg = 1 AND mdm_employee_rk IN (SELECT mdm_employee_rk
FROM prod_proteus.mdm_employee_d_detail_last_day PREWHERE legal_employee_flg = 1
WHERE warden_n > 0 AND 1
ORDER BY mdm_employee_rk ASC NULLS LAST, mdm_employee_rk
LIMIT 5000))
    )
  )
  )
  GROUP BY ch
)
  ) GROUP BY role
  UNION ALL
  SELECT '4 датасет: список КП', concat('роль ', role), concat(toString(count()), ' строк / ', toString(sum(length(j) + length(v) + length(k))), ' байт'), 'ответ датасета как есть'
  FROM (
WITH
  arrayElement((
    SELECT groupArray((mdm_employee_rk, ad_login, first_nm, management_unit_nm, warden_cross_data_flg,
      personal_management_unit_rk_list, personal_exception_management_unit_rk_list, personal_legal_unit_rk_list,
      personal_functional_unit_rk_list, personal_exception_mdm_employee_rk_list,
      grade_management_unit_rk_list, grade_exception_management_unit_rk_list, grade_legal_unit_rk_list,
      grade_functional_unit_rk_list, grade_exception_mdm_employee_rk_list,
      seniority_management_unit_rk_list, seniority_exception_management_unit_rk_list, seniority_legal_unit_rk_list,
      seniority_exception_mdm_employee_rk_list,
      review_management_unit_rk_list, review_exception_management_unit_rk_list, review_legal_unit_rk_list,
      review_functional_unit_rk_list, review_exception_mdm_employee_rk_list,
      warden_support_gph_flg, profession_array_nm))
    FROM prod_proteus.warden_access_array_cross
    WHERE ad_login = 'ваш_логин'
  ), 1) AS warden_array,
  (SELECT count() FROM prod_proteus.warden_access_array_cross WHERE ad_login = 'ваш_логин') AS warden_n,
  CAST([], 'Array(String)') AS dl_mu, CAST([], 'Array(String)') AS dl_lu, CAST([], 'Array(String)') AS dl_kp
SELECT ifNull(role, '') AS role, ifNull(k, '') AS k, ifNull(v, '') AS v, toInt64(ifNull(n, 0)) AS n, ifNull(j, '') AS j
FROM (
  
  SELECT 'meta' AS role, 'kp' AS k, '' AS v, toInt64(if(warden_n > 0, countIf(1), 0)) AS n,
    concat('{"m":', toJSONString(map(
        'ver', '3', 'mode', 'kp', 'view', 'list', 'cf', '_kf', 'ok', toString(warden_n > 0), 'first_nm', ifNull(toString(warden_array.3), ''),
        'total', toString(if(warden_n > 0, countIf(1), 0)), 'all', toString(if(warden_n > 0, count(), 0)),
        'data_dt', ifNull(toString(max(business_dt)), ''), 'per', 'last', 'dt', '', 'emp', 'Юридическая',
        'tcr', '', 'sort', 'master_id:asc', 'lim', '5000', 'chunk', '500',
        'cube_chunk', '25000', 'alph', '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_',
        'rq', '', 'frq', '')),
      ',"a":', toJSONString(map('flt', CAST([], 'Array(String)'), 'mu', CAST([], 'Array(String)'), 'lu', CAST([], 'Array(String)'), 'kp', CAST([], 'Array(String)'),
        'id', CAST([], 'Array(String)'), 'cols', ['master_id', 'hiredate', 'my_link', 'full_nm', 'birth_dt', 'mdm_employee_age', 'age_generation_nm', 'company_fire_dt', 'work_experience_year', 'contact_main_phone_no', 'prs_email_address_txt', 'registration_state_nm', 'registration_city_nm', 'registration_full_address_txt', 'residential_state_nm', 'city_nm', 'residential_full_address_txt', 'doc_city_nm', 'education_degree_unique_max', 'education_spec_nm', 'office_desc', 'ad_login', 'wrk_email_address_txt', 'active_type_nm', 'employment_relation_type_desc', 'employee_status_desc', 'employee_contract_type_desc', 'regional_hr_login', 'employee_main_contract_type_nm', 'employee_main_contract_end_dt', 'legal_position_nm', 'lvl3_mapped_management_unit_nm', 'lvl4_mapped_management_unit_nm', 'lvl5_mapped_management_unit_nm', 'lvl6_mapped_management_unit_nm', 'lvl7_mapped_management_unit_nm', 'lvl8_mapped_management_unit_nm', 'lvl9_mapped_management_unit_nm', 'lvl10_mapped_management_unit_nm', 'lvl11_mapped_management_unit_nm', 'mapped_management_unit_nm', 'subordination_lvl', 'emp_specialization_oper_code', 'emp_specialization_it_code', 'emp_stream_desc', 'emp_specialization_desc', 'management_head_flg', 'head_lvl_segment', 'management_head_nm', 'head_login', 'hrbp_nm', 'hrbp_login', 'hrap_login', 'change_management_unit_dt_text', 'change_management_head_dt', 'change_specialization_dt_text', 'has_children_flg'], 'pt', ['r'])),
      '}') AS j
  FROM (SELECT * FROM prod_proteus.mdm_employee_d_detail_last_day_functional PREWHERE legal_employee_flg = 1 LIMIT 1 BY mdm_employee_rk)

  UNION ALL
  
  SELECT 'r' AS role, toString(ch) AS k, '' AS v, toInt64(count()) AS n,
    base64Encode(arrayStringConcat(arrayMap(x -> x.2, arraySort(x -> x.1, groupArray((rn, line)))), '\n')) AS j
  FROM (
  SELECT intDiv(rn - 1, 500) AS ch, rn, line
  FROM (
    SELECT row_number() OVER (ORDER BY sk ASC NULLS LAST, mdm_employee_rk) AS rn, line
    FROM (
      SELECT mdm_employee_rk, mdm_employee_rk AS sk,
        concat(replaceRegexpAll(replaceAll(replaceAll(replaceAll(ifNull(toString(mdm_employee_rk), ''), unhex('E280A8'), ' '), unhex('E280A9'), ' '), unhex('EFBBBF'), ' '), '[[:cntrl:]]', ' '), '\t', replaceRegexpAll(replaceAll(replaceAll(replaceAll(ifNull(toString(company_hire_dt), ''), unhex('E280A8'), ' '), unhex('E280A9'), ' '), unhex('EFBBBF'), ' '), '[[:cntrl:]]', ' '), '\t', replaceRegexpAll(replaceAll(replaceAll(replaceAll(ifNull(toString(employee_link), ''), unhex('E280A8'), ' '), unhex('E280A9'), ' '), unhex('EFBBBF'), ' '), '[[:cntrl:]]', ' '), '\t', replaceRegexpAll(replaceAll(replaceAll(replaceAll(ifNull(toString(if(wpf = 1, full_nm, '⛔')), ''), unhex('E280A8'), ' '), unhex('E280A9'), ' '), unhex('EFBBBF'), ' '), '[[:cntrl:]]', ' '), '\t', replaceRegexpAll(replaceAll(replaceAll(replaceAll(ifNull(toString(if(wpf = 1, toDateTime64(birth_dt_text, 0), NULL)), ''), unhex('E280A8'), ' '), unhex('E280A9'), ' '), unhex('EFBBBF'), ' '), '[[:cntrl:]]', ' '), '\t', replaceRegexpAll(replaceAll(replaceAll(replaceAll(ifNull(toString(if(wpf = 1, toString(mdm_employee_age), '⛔')), ''), unhex('E280A8'), ' '), unhex('E280A9'), ' '), unhex('EFBBBF'), ' '), '[[:cntrl:]]', ' '), '\t', replaceRegexpAll(replaceAll(replaceAll(replaceAll(ifNull(toString(if(wpf = 1, age_generation_nm, '⛔')), ''), unhex('E280A8'), ' '), unhex('E280A9'), ' '), unhex('EFBBBF'), ' '), '[[:cntrl:]]', ' '), '\t', replaceRegexpAll(replaceAll(replaceAll(replaceAll(ifNull(toString(company_fire_dt), ''), unhex('E280A8'), ' '), unhex('E280A9'), ' '), unhex('EFBBBF'), ' '), '[[:cntrl:]]', ' '), '\t', replaceRegexpAll(replaceAll(replaceAll(replaceAll(ifNull(toString(work_experience_year), ''), unhex('E280A8'), ' '), unhex('E280A9'), ' '), unhex('EFBBBF'), ' '), '[[:cntrl:]]', ' '), '\t', replaceRegexpAll(replaceAll(replaceAll(replaceAll(ifNull(toString(if(wpf = 1, contact_main_phone_no, '⛔')), ''), unhex('E280A8'), ' '), unhex('E280A9'), ' '), unhex('EFBBBF'), ' '), '[[:cntrl:]]', ' '), '\t', replaceRegexpAll(replaceAll(replaceAll(replaceAll(ifNull(toString(if(wpf = 1, prs_email_address_txt, '⛔')), ''), unhex('E280A8'), ' '), unhex('E280A9'), ' '), unhex('EFBBBF'), ' '), '[[:cntrl:]]', ' '), '\t', replaceRegexpAll(replaceAll(replaceAll(replaceAll(ifNull(toString(if(wpf = 1, registration_state_nm, '⛔')), ''), unhex('E280A8'), ' '), unhex('E280A9'), ' '), unhex('EFBBBF'), ' '), '[[:cntrl:]]', ' '), '\t', replaceRegexpAll(replaceAll(replaceAll(replaceAll(ifNull(toString(if(wpf = 1, coalesce(registration_city_nm, registration_settlement_nm), '⛔')), ''), unhex('E280A8'), ' '), unhex('E280A9'), ' '), unhex('EFBBBF'), ' '), '[[:cntrl:]]', ' '), '\t', replaceRegexpAll(replaceAll(replaceAll(replaceAll(ifNull(toString(if(wpf = 1, registration_full_address_txt, '⛔')), ''), unhex('E280A8'), ' '), unhex('E280A9'), ' '), unhex('EFBBBF'), ' '), '[[:cntrl:]]', ' '), '\t', replaceRegexpAll(replaceAll(replaceAll(replaceAll(ifNull(toString(residential_state_nm), ''), unhex('E280A8'), ' '), unhex('E280A9'), ' '), unhex('EFBBBF'), ' '), '[[:cntrl:]]', ' '), '\t', replaceRegexpAll(replaceAll(replaceAll(replaceAll(ifNull(toString(city_nm), ''), unhex('E280A8'), ' '), unhex('E280A9'), ' '), unhex('EFBBBF'), ' '), '[[:cntrl:]]', ' '), '\t', replaceRegexpAll(replaceAll(replaceAll(replaceAll(ifNull(toString(if(wpf = 1, residential_full_address_txt, '⛔')), ''), unhex('E280A8'), ' '), unhex('E280A9'), ' '), unhex('EFBBBF'), ' '), '[[:cntrl:]]', ' '), '\t', replaceRegexpAll(replaceAll(replaceAll(replaceAll(ifNull(toString(doc_city_nm), ''), unhex('E280A8'), ' '), unhex('E280A9'), ' '), unhex('EFBBBF'), ' '), '[[:cntrl:]]', ' '), '\t', replaceRegexpAll(replaceAll(replaceAll(replaceAll(ifNull(toString(education_degree_unique_max), ''), unhex('E280A8'), ' '), unhex('E280A9'), ' '), unhex('EFBBBF'), ' '), '[[:cntrl:]]', ' '), '\t', replaceRegexpAll(replaceAll(replaceAll(replaceAll(ifNull(toString(education_spec_nm), ''), unhex('E280A8'), ' '), unhex('E280A9'), ' '), unhex('EFBBBF'), ' '), '[[:cntrl:]]', ' '), '\t', replaceRegexpAll(replaceAll(replaceAll(replaceAll(ifNull(toString(office_desc), ''), unhex('E280A8'), ' '), unhex('E280A9'), ' '), unhex('EFBBBF'), ' '), '[[:cntrl:]]', ' '), '\t', replaceRegexpAll(replaceAll(replaceAll(replaceAll(ifNull(toString(ad_login), ''), unhex('E280A8'), ' '), unhex('E280A9'), ' '), unhex('EFBBBF'), ' '), '[[:cntrl:]]', ' '), '\t', replaceRegexpAll(replaceAll(replaceAll(replaceAll(ifNull(toString(wrk_email_address_txt), ''), unhex('E280A8'), ' '), unhex('E280A9'), ' '), unhex('EFBBBF'), ' '), '[[:cntrl:]]', ' '), '\t', replaceRegexpAll(replaceAll(replaceAll(replaceAll(ifNull(toString(active_type_nm), ''), unhex('E280A8'), ' '), unhex('E280A9'), ' '), unhex('EFBBBF'), ' '), '[[:cntrl:]]', ' '), '\t', replaceRegexpAll(replaceAll(replaceAll(replaceAll(ifNull(toString(employment_relation_type_desc), ''), unhex('E280A8'), ' '), unhex('E280A9'), ' '), unhex('EFBBBF'), ' '), '[[:cntrl:]]', ' '), '\t', replaceRegexpAll(replaceAll(replaceAll(replaceAll(ifNull(toString(employee_status_desc), ''), unhex('E280A8'), ' '), unhex('E280A9'), ' '), unhex('EFBBBF'), ' '), '[[:cntrl:]]', ' '), '\t', replaceRegexpAll(replaceAll(replaceAll(replaceAll(ifNull(toString(employee_contract_type_desc), ''), unhex('E280A8'), ' '), unhex('E280A9'), ' '), unhex('EFBBBF'), ' '), '[[:cntrl:]]', ' '), '\t', replaceRegexpAll(replaceAll(replaceAll(replaceAll(ifNull(toString(regional_hr_login), ''), unhex('E280A8'), ' '), unhex('E280A9'), ' '), unhex('EFBBBF'), ' '), '[[:cntrl:]]', ' '), '\t', replaceRegexpAll(replaceAll(replaceAll(replaceAll(ifNull(toString(employee_main_contract_type_nm), ''), unhex('E280A8'), ' '), unhex('E280A9'), ' '), unhex('EFBBBF'), ' '), '[[:cntrl:]]', ' '), '\t', replaceRegexpAll(replaceAll(replaceAll(replaceAll(ifNull(toString(employee_main_contract_end_dt), ''), unhex('E280A8'), ' '), unhex('E280A9'), ' '), unhex('EFBBBF'), ' '), '[[:cntrl:]]', ' '), '\t', replaceRegexpAll(replaceAll(replaceAll(replaceAll(ifNull(toString(legal_position_nm), ''), unhex('E280A8'), ' '), unhex('E280A9'), ' '), unhex('EFBBBF'), ' '), '[[:cntrl:]]', ' '), '\t', replaceRegexpAll(replaceAll(replaceAll(replaceAll(ifNull(toString(lvl3_mapped_management_unit_nm), ''), unhex('E280A8'), ' '), unhex('E280A9'), ' '), unhex('EFBBBF'), ' '), '[[:cntrl:]]', ' '), '\t', replaceRegexpAll(replaceAll(replaceAll(replaceAll(ifNull(toString(lvl4_mapped_management_unit_nm), ''), unhex('E280A8'), ' '), unhex('E280A9'), ' '), unhex('EFBBBF'), ' '), '[[:cntrl:]]', ' '), '\t', replaceRegexpAll(replaceAll(replaceAll(replaceAll(ifNull(toString(lvl5_mapped_management_unit_nm), ''), unhex('E280A8'), ' '), unhex('E280A9'), ' '), unhex('EFBBBF'), ' '), '[[:cntrl:]]', ' '), '\t', replaceRegexpAll(replaceAll(replaceAll(replaceAll(ifNull(toString(lvl6_mapped_management_unit_nm), ''), unhex('E280A8'), ' '), unhex('E280A9'), ' '), unhex('EFBBBF'), ' '), '[[:cntrl:]]', ' '), '\t', replaceRegexpAll(replaceAll(replaceAll(replaceAll(ifNull(toString(lvl7_mapped_management_unit_nm), ''), unhex('E280A8'), ' '), unhex('E280A9'), ' '), unhex('EFBBBF'), ' '), '[[:cntrl:]]', ' '), '\t', replaceRegexpAll(replaceAll(replaceAll(replaceAll(ifNull(toString(lvl8_mapped_management_unit_nm), ''), unhex('E280A8'), ' '), unhex('E280A9'), ' '), unhex('EFBBBF'), ' '), '[[:cntrl:]]', ' '), '\t', replaceRegexpAll(replaceAll(replaceAll(replaceAll(ifNull(toString(lvl9_mapped_management_unit_nm), ''), unhex('E280A8'), ' '), unhex('E280A9'), ' '), unhex('EFBBBF'), ' '), '[[:cntrl:]]', ' '), '\t', replaceRegexpAll(replaceAll(replaceAll(replaceAll(ifNull(toString(lvl10_mapped_management_unit_nm), ''), unhex('E280A8'), ' '), unhex('E280A9'), ' '), unhex('EFBBBF'), ' '), '[[:cntrl:]]', ' '), '\t', replaceRegexpAll(replaceAll(replaceAll(replaceAll(ifNull(toString(lvl11_mapped_management_unit_nm), ''), unhex('E280A8'), ' '), unhex('E280A9'), ' '), unhex('EFBBBF'), ' '), '[[:cntrl:]]', ' '), '\t', replaceRegexpAll(replaceAll(replaceAll(replaceAll(ifNull(toString(mapped_management_unit_nm), ''), unhex('E280A8'), ' '), unhex('E280A9'), ' '), unhex('EFBBBF'), ' '), '[[:cntrl:]]', ' '), '\t', replaceRegexpAll(replaceAll(replaceAll(replaceAll(ifNull(toString(subordination_lvl), ''), unhex('E280A8'), ' '), unhex('E280A9'), ' '), unhex('EFBBBF'), ' '), '[[:cntrl:]]', ' '), '\t', replaceRegexpAll(replaceAll(replaceAll(replaceAll(ifNull(toString(emp_specialization_oper_code), ''), unhex('E280A8'), ' '), unhex('E280A9'), ' '), unhex('EFBBBF'), ' '), '[[:cntrl:]]', ' '), '\t', replaceRegexpAll(replaceAll(replaceAll(replaceAll(ifNull(toString(emp_specialization_it_code), ''), unhex('E280A8'), ' '), unhex('E280A9'), ' '), unhex('EFBBBF'), ' '), '[[:cntrl:]]', ' '), '\t', replaceRegexpAll(replaceAll(replaceAll(replaceAll(ifNull(toString(emp_stream_desc), ''), unhex('E280A8'), ' '), unhex('E280A9'), ' '), unhex('EFBBBF'), ' '), '[[:cntrl:]]', ' '), '\t', replaceRegexpAll(replaceAll(replaceAll(replaceAll(ifNull(toString(emp_specialization_desc), ''), unhex('E280A8'), ' '), unhex('E280A9'), ' '), unhex('EFBBBF'), ' '), '[[:cntrl:]]', ' '), '\t', replaceRegexpAll(replaceAll(replaceAll(replaceAll(ifNull(toString(management_head_flg), ''), unhex('E280A8'), ' '), unhex('E280A9'), ' '), unhex('EFBBBF'), ' '), '[[:cntrl:]]', ' '), '\t', replaceRegexpAll(replaceAll(replaceAll(replaceAll(ifNull(toString(head_lvl_segment), ''), unhex('E280A8'), ' '), unhex('E280A9'), ' '), unhex('EFBBBF'), ' '), '[[:cntrl:]]', ' '), '\t', replaceRegexpAll(replaceAll(replaceAll(replaceAll(ifNull(toString(if(wpf = 1, management_head_nm, '⛔')), ''), unhex('E280A8'), ' '), unhex('E280A9'), ' '), unhex('EFBBBF'), ' '), '[[:cntrl:]]', ' '), '\t', replaceRegexpAll(replaceAll(replaceAll(replaceAll(ifNull(toString(head_login), ''), unhex('E280A8'), ' '), unhex('E280A9'), ' '), unhex('EFBBBF'), ' '), '[[:cntrl:]]', ' '), '\t', replaceRegexpAll(replaceAll(replaceAll(replaceAll(ifNull(toString(if(wpf = 1, hrbp_nm, '⛔')), ''), unhex('E280A8'), ' '), unhex('E280A9'), ' '), unhex('EFBBBF'), ' '), '[[:cntrl:]]', ' '), '\t', replaceRegexpAll(replaceAll(replaceAll(replaceAll(ifNull(toString(hrbp_login), ''), unhex('E280A8'), ' '), unhex('E280A9'), ' '), unhex('EFBBBF'), ' '), '[[:cntrl:]]', ' '), '\t', replaceRegexpAll(replaceAll(replaceAll(replaceAll(ifNull(toString(hrap_login), ''), unhex('E280A8'), ' '), unhex('E280A9'), ' '), unhex('EFBBBF'), ' '), '[[:cntrl:]]', ' '), '\t', replaceRegexpAll(replaceAll(replaceAll(replaceAll(ifNull(toString(change_management_unit_dt_text), ''), unhex('E280A8'), ' '), unhex('E280A9'), ' '), unhex('EFBBBF'), ' '), '[[:cntrl:]]', ' '), '\t', replaceRegexpAll(replaceAll(replaceAll(replaceAll(ifNull(toString(change_management_head_dt), ''), unhex('E280A8'), ' '), unhex('E280A9'), ' '), unhex('EFBBBF'), ' '), '[[:cntrl:]]', ' '), '\t', replaceRegexpAll(replaceAll(replaceAll(replaceAll(ifNull(toString(change_specialization_dt_text), ''), unhex('E280A8'), ' '), unhex('E280A9'), ' '), unhex('EFBBBF'), ' '), '[[:cntrl:]]', ' '), '\t', replaceRegexpAll(replaceAll(replaceAll(replaceAll(ifNull(toString(if(wpf = 1, toString(has_children_flg), '⛔')), ''), unhex('E280A8'), ' '), unhex('E280A9'), ' '), unhex('EFBBBF'), ' '), '[[:cntrl:]]', ' ')) AS line
      FROM (SELECT *,
            if (
    warden_array.5=1
    or
      case when warden_array.2 in ('an.a.sokolova','r.dorofeev') then active_type_nm = 'Стажеры' else 1!=1 end --доступ в рамках задачи CROSS-8440 и CROSS-15151
    or
      case when warden_array.2 in ('v.larionova', 'a.tumanik','k.a.chernova','i.lelyuk', 'i.s.verbitskaya','k.samolyuk', 'e.tyazheva') then tcr_flg = 1 else 1!=1 end --доступ в рамках задачи CROSS-9940
    or
      case when warden_array.25 =1 then employment_relation_type_desc != 'Штатный сотрудник' else 1!=1 end --доступ для команды учета исполнителей
    or
    hasAny(warden_array.26, profession_nm_array_new) --варден для лидеров профессий
    or
    (hasAny([warden_array.2], login_reg_hr_list)
    and lvl3_mapped_management_unit_rk != 'c10fb1ad1295902238dba3019d92ce41')
      or
    (
    (
      (
      hasAny(warden_array.6, mapped_management_unit_rk_list)
      and (not hasAny(warden_array.7, mapped_management_unit_rk_list))
      )
    or
      (hasAny(warden_array.8, legal_unit_rk_list)
      )
    or
      (hasAny(warden_array.9, functional_unit_rk_list))
    )
    and (not hasAny(warden_array.10, mdm_employee_rk_list)))
    ,1,0) AS wpf,
            if (
    warden_array.5=1
    or
      hasAny(warden_array.26, profession_nm_array_new) --варден для лидеров профессий
    or
      case when warden_array.2 in ('v.larionova', 'a.tumanik','k.a.chernova','i.lelyuk', 'i.s.verbitskaya','k.samolyuk', 'e.tyazheva') then tcr_flg = 1 else 1!=1 end --доступ в рамках задачи CROSS-9940
            or
      warden_array.2 in ('v.poljakov') and v_poljakov_access_flg = 1 --доступ в рамках задачи CROSS-16526
            or
      (hasAny([warden_array.2], login_reg_hr_list)
      and lvl3_mapped_management_unit_rk != 'c10fb1ad1295902238dba3019d92ce41')
      or
      (
    (
      (
      hasAny(warden_array.11, mapped_management_unit_rk_list)
      and (not hasAny(warden_array.12, mapped_management_unit_rk_list))
      )
    or
      (hasAny(warden_array.13, legal_unit_rk_list)
      )
    or
      (hasAny(warden_array.14, functional_unit_rk_list))
    )
    and (not hasAny(warden_array.15, mdm_employee_rk_list)))
    ,1,0) AS wgf,
            if (
    warden_array.5=1
    or
      hasAny(warden_array.26, profession_nm_array_new) --варден для лидеров профессий
    or
       case when warden_array.2 in ('v.larionova', 'a.tumanik','k.a.chernova','i.lelyuk', 'i.s.verbitskaya','k.samolyuk', 'e.tyazheva') then tcr_flg = 1 else 1!=1 end --доступ в рамках задачи CROSS-9940
    or
      warden_array.2 in ('v.poljakov') and v_poljakov_access_flg = 1 --доступ в рамках задачи CROSS-16526
    or
    (hasAny([warden_array.2], login_reg_hr_list)
    and lvl3_mapped_management_unit_rk != 'c10fb1ad1295902238dba3019d92ce41')
      or
          ((
        (
        hasAny(warden_array.16, mapped_management_unit_rk_list)
        and (not hasAny(warden_array.17, mapped_management_unit_rk_list))
        )
      or
        (
        hasAny(warden_array.18, legal_unit_rk_list)
        )
        )
      and (not hasAny(warden_array.19, mdm_employee_rk_list)))
    ,1,0) AS wsf,
            if (
    warden_array.5=1
        or
    (hasAny([warden_array.2], login_reg_hr_list)
    and lvl3_mapped_management_unit_rk != 'c10fb1ad1295902238dba3019d92ce41')
      or
    (
    (
      (
      hasAny(warden_array.20, mapped_management_unit_rk_list)
      and (not hasAny(warden_array.21, mapped_management_unit_rk_list))
      )
    or
      (hasAny(warden_array.22, legal_unit_rk_list)
      )
    or
      (hasAny(warden_array.23, functional_unit_rk_list))
    )
    and (not hasAny(warden_array.24, mdm_employee_rk_list)))
    ,1,0) AS wrf
          FROM prod_proteus.mdm_employee_d_detail_last_day_functional
          PREWHERE legal_employee_flg = 1 AND mdm_employee_rk IN (SELECT mdm_employee_rk
FROM (SELECT * FROM prod_proteus.mdm_employee_d_detail_last_day_functional PREWHERE legal_employee_flg = 1 LIMIT 1 BY mdm_employee_rk)
WHERE warden_n > 0 AND 1
ORDER BY mdm_employee_rk ASC NULLS LAST, mdm_employee_rk
LIMIT 5000)
      LIMIT 1 BY mdm_employee_rk)
    )
  )
  )
  GROUP BY ch
)
  ) GROUP BY role
)
ORDER BY part, metric
