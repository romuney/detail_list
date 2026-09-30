// ============================================================================
// detail-list.chart.js — чарты «Детальные списки» и «Детальные списки КП»
// ============================================================================
// КОНТРАКТ PROTEUS:
//   ECharts = только холст. Вся визуализация - HTML/CSS/SVG в overlay.
//   Хост = ПОСЛЕДНИЙ [_echarts_instance_]. Canvas прячем. Overlay - appendChild.
//   В САМОМ КОНЦЕ ФАЙЛА, ГЛОБАЛЬНО: option = {...} с пустым scatter.
//
// ЗАПРЕЩЕНО: backticks/template-literals, стрелочные функции, let/const,
//   document.getElementById (только overlay.querySelector), console.log в итоге,
//   addEventListener внутри тела render(), обращение к option из catch,
//   мутация option после присваивания, var P = '.' + CFG.ns в buildHTML
//   (точка только в buildCSS).
// ОБЯЗАТЕЛЬНО: все 7 блоков ниже, в таком порядке, без перенумерации.
// ОБЯЗАТЕЛЬНО: вызов render(); в теле mount() — без него overlay пустой.
//
// ВЫЧИСЛЕНИЯ ЖИВУТ ЗДЕСЬ, А НЕ В SQL. Проценты, дельты, ранги, накопительные
//   итоги, сортировка и форматирование считаются в buildModel() (БЛОК 3).
//   SQL отдаёт сырые строки — базу не нагружаем.
// ============================================================================

// ---------- БЛОК 1: CFG ----------
// Один файл на оба чарта: вёрстка и поведение одинаковые, режим (us | kp) приходит из
// датасета (meta). Файлы поставки отличаются только строкой ns: у чарта «Детальные списки
// КП» — 'dlk'. Так у двух чартов на одном дашборде свои состояние, стили и тултип.
// Данные — датасет proteus/detail-list.data.sql: строки разных ролей (role), пять колонок.
// Вкладка — два чарта: панель фильтров слева (detail-list-filters.chart.js) и этот список. Фильтры эмитит
// панель (себе и списку); список эмитит САМ СЕБЕ (самовлияние включено) только сортировку, лимит и
// колонки. Страницы, поиск по таблице, сортировка загруженного, группировка и «Копировать» — без
// запроса. «Применить» в панели фильтров присылает сюда DL_FLT {cf, frq}: «Обновляю…», пока в ответе
// нет той же метки frq.
var CFG = {
  ns: 'dlk',
  mode: 'snapshot',            // снимок на дату данных; период выбирается фильтром «Период»
  fields: { role: 'role', k: 'k', v: 'v', n: 'n', j: 'j' },
  title: { us: 'Детальные списки', kp: 'Детальные списки КП' },
  sub: { us: 'Параллельная структура', kp: 'Каталог продуктов' },
  limits: [5000, 10000, 25000],
  pageSizes: [50, 100, 200, 500],
  defaultCols: ['master_id', 'hiredate'],
  locked: { us: ['master_id', 'hiredate'], kp: ['master_id'] },
  emp: ['Юридическая', 'Активная'],
  tcr: ['ТЦР РФ', 'ТЦР СНГ', 'ТЦР РФ + ТЦР СНГ'],
  // Пределы — как у датасета: лишнее он отбросит, чарт не даёт набрать больше.
  maxGroup: 3,
  // Ответа с меткой запроса нет столько — чарт не фильтрует сам себя (или запрос завис).
  pendingWarnMs: 30000,
  mask: '⛔', maskText: '⛔️ Нет доступа к данным',
  // Колонки: ключ~подпись~группа — как в прежних чартах (добавлена «Ссылка на майти»).
  fieldDefs:
    'master_id~MasterID~Базовое;hiredate~Дата найма в компанию~Базовое;my_link~Ссылка на майти~Базовое;' +
    'last_nm~Фамилия~Атрибут ФЛ;first_nm~Имя~Атрибут ФЛ;full_nm~Полное ФИО~Атрибут ФЛ;' +
    'birth_dt~Дата рождения~Атрибут ФЛ;birth_day~День рождения~Атрибут ФЛ;' +
    'birth_month~Месяц рождения~Атрибут ФЛ;mdm_employee_age~Возраст~Атрибут ФЛ;' +
    'age_generation_nm~Возрастные поколения~Атрибут ФЛ;contact_main_phone_no~Номер телефона~Атрибут ФЛ;' +
    'prs_email_address_txt~Личная почта~Атрибут ФЛ;employee_document_type_desc~Тип документа~Атрибут ФЛ;' +
    'citizenship_country_desc~Страна гражданства~Атрибут ФЛ;' +
    'registration_state_nm~Регион регистрации~Атрибут ФЛ;registration_city_nm~Город регистрации~Атрибут ФЛ;' +
    'registration_full_address_txt~Полный адрес регистрации~Атрибут ФЛ;' +
    'residential_state_nm~Регион проживания~Атрибут ФЛ;city_nm~Город проживания~Атрибут ФЛ;' +
    'residential_full_address_txt~Полный адрес проживания~Атрибут ФЛ;' +
    'doc_city_nm~Город отправки документов из 1С~Атрибут ФЛ;' +
    'marital_status_desc~Семейное положение~Атрибут ФЛ;gender_desc~Пол~Атрибут ФЛ;' +
    'education_degree_unique_max~Уровень образования~Атрибут ФЛ;' +
    'education_spec_nm~Направление образования~Атрибут ФЛ;has_children_flg~Наличие детей~Атрибут ФЛ;' +
    'location_type~Локация~Атрибут ФЛ;macroregion_nm~Макрорегион~Атрибут ФЛ;' +
    'office_desc~Офис~Атрибут сотрудника;ad_login~Логин~Атрибут сотрудника;' +
    'wo_employee_login~WO логин~Атрибут сотрудника;wrk_email_address_txt~Рабочая почта~Атрибут сотрудника;' +
    'clothes_size_code~Размер одежды~Атрибут сотрудника;party_id~Основной Siebel_ID~Атрибут сотрудника;' +
    'company_fire_dt~Дата увольнения из компании~Атрибут сотрудника;' +
    't_education_desc~Принадлежность к T-образованию~Атрибут сотрудника;' +
    'work_experience_year~Стаж в годах~Атрибут сотрудника;' +
    'experience_group_nm~Группа стажа~Атрибут сотрудника;active_type_nm~Тип численности~Атрибут сотрудника;' +
    'seniority~Уровень позиции~Атрибут сотрудника;grade~Грейд~Атрибут сотрудника;' +
    'change_grade_dt_text~Дата перевода в текущий грейд~Атрибут сотрудника;' +
    'change_specialization_dt_text~Дата перевода в текущую специализацию~Атрибут сотрудника;' +
    'change_management_unit_dt_text~Дата перевода в текущую команду~Атрибут сотрудника;' +
    'change_management_head_dt~Дата перевода в руководителя~Атрибут сотрудника;' +
    'summary_score~Оценка ревью~Атрибут сотрудника;' +
    'employment_relation_type_desc~Тип трудоустройства~Атрибут ЮС;' +
    'employee_status_desc~Статус позиции~Атрибут ЮС;employee_contract_type_desc~Тип договора~Атрибут ЮС;' +
    'legal_position_nm~Должность~Атрибут ЮС;employee_main_work_no~Табельный номер~Атрибут ЮС;' +
    'legal_hire_dt~Дата найма на юр позицию~Атрибут ЮС;legal_fire_dt~Дата увольнения с юр позиции~Атрибут ЮС;' +
    'lvl1_legal_unit_nm~ЮС - Уровень 1~Атрибут ЮС;lvl2_legal_unit_nm~ЮС - Уровень 2~Атрибут ЮС;' +
    'lvl3_legal_unit_nm~ЮС - Уровень 3~Атрибут ЮС;lvl4_legal_unit_nm~ЮС - Уровень 4~Атрибут ЮС;' +
    'lvl5_legal_unit_nm~ЮС - Уровень 5~Атрибут ЮС;lvl6_legal_unit_nm~ЮС - Уровень 6~Атрибут ЮС;' +
    'lvl7_legal_unit_nm~ЮС - Уровень 7~Атрибут ЮС;hr_head_nm~ФИ регионального HR~Атрибут ЮС;' +
    'regional_hr_login~Логин регионального HR~Атрибут ЮС;' +
    'hr_head_mdm_employee_rk~MasterID регионального HR~Атрибут ЮС;code_1c~Код юнита из 1С~Атрибут ЮС;' +
    'employee_main_contract_type_nm~Срочный/бессрочный ТД~Атрибут ЮС;' +
    'employee_main_contract_end_dt~Дата окончания ТД~Атрибут ЮС;' +
    'legal_head_flg~Флаг руководителя ЮС~Атрибут ЮС;employee_main_schedule_nm~Штатное расписание~Атрибут ЮС;' +
    'emp_contract_no~Номер трудового договора~Атрибут ЮС;' +
    'lvl3_mapped_management_unit_nm~УС - Уровень 3~Атрибут УС;' +
    'lvl4_mapped_management_unit_nm~УС - Уровень 4~Атрибут УС;' +
    'lvl5_mapped_management_unit_nm~УС - Уровень 5~Атрибут УС;' +
    'lvl6_mapped_management_unit_nm~УС - Уровень 6~Атрибут УС;' +
    'lvl7_mapped_management_unit_nm~УС - Уровень 7~Атрибут УС;' +
    'lvl8_mapped_management_unit_nm~УС - Уровень 8~Атрибут УС;' +
    'lvl9_mapped_management_unit_nm~УС - Уровень 9~Атрибут УС;' +
    'lvl10_mapped_management_unit_nm~УС - Уровень 10~Атрибут УС;' +
    'lvl11_mapped_management_unit_nm~УС - Уровень 11~Атрибут УС;mapped_management_unit_nm~Юнит УС~Атрибут УС;' +
    'emp_specialization_oper_code~HQ|Line|Support~Атрибут УС;emp_specialization_it_code~IT|nonIT~Атрибут УС;' +
    'emp_stream_desc~Стрим~Атрибут УС;emp_specialization_desc~Специализация~Атрибут УС;' +
    'management_head_flg~Флаг руководителя УС~Атрибут УС;head_lvl_segment~Сегмент руководителя~Атрибут УС;' +
    'management_head_nm~ФИ руководителя~Атрибут УС;head_login~Логин руководителя~Атрибут УС;' +
    'head_wo_employee_login~WO логин руководителя~Атрибут УС;' +
    'head_wrk_email_address_txt~Почта руководителя~Атрибут УС;' +
    'management_head_mdm_employee_rk~MasterID руководителя~Атрибут УС;hrbp_nm~ФИ HRBP~Атрибут УС;' +
    'hrbp_login~Логин HRBP~Атрибут УС;hrbp_mdm_employee_rk~MasterID HRBP~Атрибут УС;' +
    'hrap_login~Логин HRAP~Атрибут УС;hrap_mdm_employee_rk~MasterID HRAP~Атрибут УС;' +
    'subordination_lvl~Положение сотрудника в структуре~Атрибут УС',
  kpFieldDefs: 'alloc~Аллокация~КП;kp1~КП - Уровень 1~КП;kp2~КП - Уровень 2~КП;kp3~КП - Уровень 3~КП;kp4~КП - Уровень 4~КП;' +
    'kp5~КП - Уровень 5~КП;kp6~КП - Уровень 6~КП;kp7~КП - Уровень 7~КП;kp8~КП - Уровень 8~КП;kp9~КП - Уровень 9~КП;' +
    'kp10~КП - Уровень 10~КП;kp11~КП - Уровень 11~КП;kp12~КП - Уровень 12~КП;sum_alloc~Суммарная аллокация~КП;' +
    'alloc_count~Кол-во аллокаций~КП',
  // Колонки строки аллокации (у КП); sum_alloc и alloc_count считает чарт по блоку сотрудника.
  allocKeys: ['alloc', 'kp1', 'kp2', 'kp3', 'kp4', 'kp5', 'kp6', 'kp7', 'kp8', 'kp9', 'kp10', 'kp11', 'kp12'],
  virtualKeys: ['sum_alloc', 'alloc_count'],
  dateKeys: ['hiredate', 'birth_dt', 'company_fire_dt', 'change_management_head_dt', 'legal_hire_dt', 'legal_fire_dt',
    'employee_main_contract_end_dt'],
  numKeys: ['master_id', 'birth_day', 'birth_month', 'mdm_employee_age', 'has_children_flg', 'work_experience_year', 'grade',
    'hr_head_mdm_employee_rk', 'legal_head_flg', 'management_head_flg', 'management_head_mdm_employee_rk',
    'hrbp_mdm_employee_rk', 'hrap_mdm_employee_rk', 'alloc', 'sum_alloc', 'alloc_count'],
  // Дробные — в «Копировать» с запятой (Excel в русской локали).
  decimalKeys: ['work_experience_year', 'alloc', 'sum_alloc'],
  presets: [
    { name: 'Персоналка', cols: ['master_id', 'full_nm', 'birth_dt', 'mdm_employee_age', 'age_generation_nm', 'company_fire_dt',
      'work_experience_year', 'contact_main_phone_no', 'prs_email_address_txt', 'registration_state_nm', 'registration_city_nm',
      'registration_full_address_txt', 'residential_state_nm', 'city_nm', 'residential_full_address_txt', 'doc_city_nm',
      'education_degree_unique_max', 'education_spec_nm', 'office_desc', 'ad_login', 'wrk_email_address_txt', 'active_type_nm',
      'employment_relation_type_desc', 'employee_status_desc', 'employee_contract_type_desc', 'hiredate', 'regional_hr_login',
      'employee_main_contract_type_nm', 'employee_main_contract_end_dt', 'legal_position_nm', 'lvl3_mapped_management_unit_nm',
      'lvl4_mapped_management_unit_nm', 'lvl5_mapped_management_unit_nm', 'lvl6_mapped_management_unit_nm',
      'lvl7_mapped_management_unit_nm', 'lvl8_mapped_management_unit_nm', 'lvl9_mapped_management_unit_nm',
      'lvl10_mapped_management_unit_nm', 'lvl11_mapped_management_unit_nm', 'mapped_management_unit_nm', 'subordination_lvl',
      'emp_specialization_oper_code', 'emp_specialization_it_code', 'emp_stream_desc', 'emp_specialization_desc',
      'management_head_flg', 'head_lvl_segment', 'management_head_nm', 'head_login', 'hrbp_nm', 'hrbp_login', 'hrap_login',
      'change_management_unit_dt_text', 'change_management_head_dt', 'change_specialization_dt_text', 'has_children_flg'] },
    { name: 'Рабочие данные', cols: ['master_id', 'employee_main_work_no', 'full_nm', 'legal_position_nm', 'grade',
      'management_head_flg', 'birth_dt', 'mdm_employee_age', 'company_fire_dt', 'work_experience_year', 'registration_state_nm',
      'registration_city_nm', 'residential_state_nm', 'city_nm', 'doc_city_nm', 'office_desc', 'ad_login', 'wrk_email_address_txt',
      'active_type_nm', 't_education_desc', 'employment_relation_type_desc', 'employee_status_desc', 'employee_contract_type_desc',
      'hiredate', 'lvl1_legal_unit_nm', 'lvl2_legal_unit_nm', 'lvl3_legal_unit_nm', 'lvl4_legal_unit_nm', 'lvl5_legal_unit_nm',
      'lvl6_legal_unit_nm', 'lvl7_legal_unit_nm', 'code_1c', 'employee_main_schedule_nm', 'hr_head_nm', 'regional_hr_login',
      'employee_main_contract_type_nm', 'employee_main_contract_end_dt', 'lvl3_mapped_management_unit_nm',
      'lvl4_mapped_management_unit_nm', 'lvl5_mapped_management_unit_nm', 'lvl6_mapped_management_unit_nm',
      'lvl7_mapped_management_unit_nm', 'lvl8_mapped_management_unit_nm', 'lvl9_mapped_management_unit_nm',
      'lvl10_mapped_management_unit_nm', 'lvl11_mapped_management_unit_nm', 'mapped_management_unit_nm', 'subordination_lvl',
      'emp_specialization_oper_code', 'emp_specialization_it_code', 'emp_stream_desc', 'emp_specialization_desc',
      'head_lvl_segment', 'management_head_nm', 'head_wrk_email_address_txt', 'head_login', 'hrbp_nm', 'hrbp_login',
      'hrap_login', 'change_grade_dt_text', 'seniority', 'change_management_unit_dt_text', 'change_management_head_dt',
      'change_specialization_dt_text', 'summary_score'] },
    { name: 'КП-разрез', only: 'kp', cols: ['master_id', 'full_nm', 'kp1', 'kp2', 'kp3', 'kp4', 'kp5', 'kp6', 'kp7', 'kp8', 'kp9',
      'kp10', 'kp11', 'kp12', 'alloc', 'hiredate', 'active_type_nm', 'employee_main_work_no', 'legal_position_nm'] }
  ],
  idKeys: ['rk', 'login', 'tab', 'siebel'],
  text: {
    noData: 'Нет данных',
    loading: 'Обновляю список под фильтры…',
    notApplied: 'Ответа нет 30 секунд. Если так на каждом действии — кросс-фильтры настроены не так: список должен фильтровать сам себя и получать фильтры панели фильтров (JSON-метаданные дашборда, инструкция поставки, п. 4).',
    noAccess: 'Для вашего логина нет строки в таблице доступа warden — список недоступен.',
    noCf: 'Сортировка и колонки не применились: в этом окружении нет applyCrossFilter (откройте чарт на дашборде).',
    // Под фильтрами больше, чем помещается в таблицу (последний из limits).
    over: 'Под фильтрами больше {max} сотрудников — все в таблицу не поместятся. Сузьте фильтры в панели слева, чтобы загрузились все данные.',
    part: 'В таблице первые {got} из {total}.'
  },
  // Токены — профиль виджетов Proteus Adoption, как в HRBP HUB: текст, линии, акцент #2b6cff.
  colors: {
    bg: '#f4f5f7', card: '#ffffff', line: '#e7e9ee', line2: '#eef0f3',
    ink: '#23272e', ink2: '#454b55', muted: '#8a909c', muted2: '#aab0bb',
    warnTx: '#9a6500', blue: '#3b6fe0', blueBg: '#eef3fe', blueTx: '#2b5fd0', act: '#2b6cff', actInk: '#1f55d6',
    surface2: '#f3f4f6', hover: '#fafbfc', rowHover: '#f5f8ff', grp: '#f6f7fb', hl: '#dfe8ff'
  },
  // Типографика — профиль Adoption (DESIGN_SYSTEM.md §16): кегли только по ролям, веса 400 / 500 / 600.
  // micro — вторые подписи, cap — капитель шапок, note — подписи и пилюли, control — кнопки,
  // body — таблица и текст, title — заголовок.
  fonts: {
    family: 'Inter,-apple-system,"Segoe UI",Roboto,Arial,sans-serif',
    micro: 9.5, cap: 10.5, note: 11.5, control: 12, body: 12.5, title: 14.5
  },
  // Отступы — шкала 2…16 профиля; строка таблицы списка — плотная (данных много).
  spacing: { gutter: 16, gap: 12, rowH: 32, colMin: 70, colMax: 640 }
};

// ---------- БЛОК 2: ВХОД + СОСТОЯНИЕ + ХЕЛПЕРЫ ----------
// ВСЕ строки data, не data[0].
var rawData = (typeof data !== 'undefined' && Array.isArray(data)) ? data : [];

// Состояние переживает перерисовку Proteus.
// Для таблиц с поиском/сортировкой/пагинацией имена ключей бери из TABLES.md,
// чтобы правки разных сессий не расходились.
if (!window.__pvtState) window.__pvtState = {};
var __S = window.__pvtState;
var STATE0 = {
  tip: null,
  open: '',              // открытый поповер: cols | group | lim | ''
  q: '',
  colDraft: null,        // черновик колонок в поповере «Колонки»
  colQ: '',              // поиск по названиям колонок
  columnOrder: null,     // колонки показа по порядку (null — как в ответе)
  colW: {},              // ширины колонок, px
  sortKey: '', sortDir: '', // сортировка загруженного (без запроса); '' — порядок ответа
  search: '',            // поиск по загруженным строкам
  page: 0, pageSize: 100,
  groupBy: [],           // группировка по колонкам (ключи)
  collapsedGroups: {},   // свёрнутые группы
  pend: null,            // {rq | frq, at, kind}: ждём ответ с той же меткой (rq — свой запрос, frq — панели фильтров)
  pendT: null, rqN: 0,
  warn: '',
  cache: null,           // части ответов по подписи фильтров: rows / f / t / s
  keep: null,            // прокрутка до запроса — вернуть после ответа
  copied: '',
  tour: null             // тур «Как работать»: {i, dir, shown, key, was, busy}
};
if (!__S[CFG.ns]) __S[CFG.ns] = {};
// Ключи, которых нет в состоянии прошлой версии скрипта (страницу не перезагружали), — по умолчанию.
for (var k0 in STATE0) if (STATE0.hasOwnProperty(k0) && !__S[CFG.ns].hasOwnProperty(k0)) __S[CFG.ns][k0] = STATE0[k0];
var state = __S[CFG.ns];
if (!state.cache) state.cache = { rows: null };

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}
// Числа из BI приходят и числом, и строкой с пробелами-разрядами или запятой.
function num(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return isNaN(v) ? null : v;
  var s = String(v).replace(/[\s ]/g, '');
  // '1,5' -> дробная запятая; '1,234.5' -> запятая это разряды.
  if (s.indexOf(',') > -1 && s.indexOf('.') === -1) s = s.replace(/,/g, '.');
  else s = s.replace(/,/g, '');
  var n = Number(s);
  return isNaN(n) ? null : n;
}
// Универсальный парсер даты: epoch-ms, epoch-s, 'YYYY-MM-DD', 'YYYY-MM'.
// Нужен всегда: DATETIME из Proteus приходит числом, а не строкой из UI.
function toDate(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  var s = String(raw).trim(), d = null;
  if (/^\d{11,}$/.test(s)) { var ms = Number(s); d = new Date(ms > 1e12 ? ms : ms * 1000); }
  else if (/^\d{10}$/.test(s)) d = new Date(Number(s) * 1000);
  else {
    var m = /^(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(s);
    if (m) return { y: +m[1], m: +m[2] - 1, d: m[3] ? +m[3] : 1 };
    d = new Date(s);
  }
  if (!d || isNaN(d.getTime())) return null;
  return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate() };
}

function pad2(n) { return (n < 10 ? '0' : '') + n; }
function trim(s) { return String(s == null ? '' : s).replace(/^\s+|\s+$/g, ''); }
function sameSet(a, b) {
  a = a || []; b = b || [];
  if (a.length !== b.length) return false;
  for (var i = 0; i < a.length; i++) if (b.indexOf(a[i]) < 0) return false;
  return true;
}
function lower(s) { return String(s == null ? '' : s).toLowerCase().replace(/ё/g, 'е'); }
// Пачка строк: base64 от UTF-8 — встроенными atob + TextDecoder (без посимвольного разбора base64).
var UTF8 = (typeof TextDecoder !== 'undefined') ? new TextDecoder('utf-8') : null;
function b64utf8(s) {
  if (!s) return '';
  var bin = atob(String(s));
  if (!UTF8) return decodeURIComponent(escape(bin));
  var n = bin.length, u = new Uint8Array(n);
  for (var i = 0; i < n; i++) u[i] = bin.charCodeAt(i);
  return UTF8.decode(u);
}
function parseJSON(s) { try { return JSON.parse(s); } catch (e) { return null; } }

// ---------- БЛОК 3: ТРАНСФОРМАЦИЯ ДАННЫХ ----------
// Реестр колонок: ключ → подпись, группа. У КП — плюс аллокации и два расчётных поля.
function parseDefs(s) {
  var out = [], parts = String(s).split(';');
  for (var i = 0; i < parts.length; i++) {
    var p = parts[i].split('~');
    if (p[0]) out.push({ key: p[0], label: p[1] || p[0], group: p[2] || '' });
  }
  return out;
}
var FIELD_BASE = parseDefs(CFG.fieldDefs), FIELD_KP = parseDefs(CFG.kpFieldDefs);
function inArr(a, v) { return (a || []).indexOf(v) > -1; }
function sigList(a) { return (a || []).slice().sort().join('\u0001'); }
function uniq(a) {
  var out = [], seen = {};
  for (var i = 0; i < (a || []).length; i++) if (!seen['~' + a[i]]) { seen['~' + a[i]] = 1; out.push(a[i]); }
  return out;
}
// Эхо списков: 'атрибут=значение' → {атрибут: [значения]}; keys — заранее пустые ключи.
function splitEq(list, keys) {
  var out = {};
  for (var i = 0; keys && i < keys.length; i++) out[keys[i]] = [];
  for (var j = 0; j < (list || []).length; j++) {
    var s = String(list[j]), at = s.indexOf('=');
    if (at < 0) continue;
    var a = s.slice(0, at);
    if (!out[a]) out[a] = [];
    out[a].push(s.slice(at + 1));
  }
  return out;
}
var ID_KEYS = CFG.idKeys;
// Подпись строк — применённые фильтры (эхо), колонки, сортировка и лимит: разобранные пачки
// переиспользуются, если скрипт перезапущен с тем же ответом (ресайз, перерисовка Proteus).
function fsigOf(o) {
  var s = 'p:' + (o.per === 'date' ? 'date:' + (o.dt || '') : 'last') + '|e:' + (o.emp || CFG.emp[0]) + '|t:' + (o.tcr || '');
  var ks = [];
  for (var a in (o.flt || {})) if (o.flt.hasOwnProperty(a) && o.flt[a].length) ks.push(a);
  ks.sort();
  for (var i = 0; i < ks.length; i++) s += '|f:' + ks[i] + '=' + sigList(o.flt[ks[i]]);
  s += '|mu:' + sigList(o.mu) + '|lu:' + sigList(o.lu) + '|kp:' + sigList(o.kp);
  for (var k = 0; k < ID_KEYS.length; k++) s += '|' + ID_KEYS[k] + ':' + sigList((o.id || {})[ID_KEYS[k]]);
  return s;
}
function rsigOf(o) { return fsigOf(o) + '|c:' + (o.cols || []).join(',') + '|s:' + (o.sort || '') + '|l:' + (o.lim || ''); }

// Ответ датасета (вид list) → модель: meta и пачки строк.
function buildModel() {
  var F = CFG.fields, M = { ok: false, err: '', missing: [], mode: 'us', cf: '_f', m: {}, a: {}, total: 0,
    rows: null, applied: null, rsig: '' };
  if (!rawData.length) { M.err = 'empty'; return M; }
  var r0 = rawData[0], need = ['role', 'k', 'v', 'n', 'j'];
  for (var i = 0; i < need.length; i++) if (!r0.hasOwnProperty(F[need[i]])) M.missing.push(F[need[i]]);
  if (M.missing.length) { M.err = 'columns'; return M; }
  var meta = null, chunks = [], fp = 0;
  for (var r = 0; r < rawData.length; r++) {
    var row = rawData[r], role = row[F.role];
    var k = row[F.k] == null ? '' : String(row[F.k]), j = row[F.j] == null ? '' : String(row[F.j]);
    if (role === 'meta') { meta = parseJSON(j); M.mode = k === 'kp' ? 'kp' : 'us'; M.total = num(row[F.n]) || 0; }
    else if (role === 'r') { chunks.push({ k: +k || 0, j: j }); fp += j.length; }
  }
  if (!meta || !meta.m) { M.err = 'nometa'; return M; }
  M.m = meta.m; M.a = meta.a || {};
  M.cf = M.m.cf || (M.mode === 'kp' ? '_kf' : '_f');
  M.ok = String(M.m.ok) === '1' || String(M.m.ok) === 'true';
  var a = M.a;
  M.applied = { per: M.m.per === 'date' ? 'date' : 'last', dt: M.m.dt || '', emp: M.m.emp || CFG.emp[0], tcr: M.m.tcr || '',
    flt: splitEq(a.flt), mu: (a.mu || []).slice(), lu: (a.lu || []).slice(), kp: (a.kp || []).slice(), id: splitEq(a.id, ID_KEYS),
    cols: (a.cols || []).slice(), sort: M.m.sort || 'master_id:asc', lim: +M.m.lim || CFG.limits[0] };
  M.rsig = rsigOf(M.applied);
  var C = state.cache;
  if (C.mode !== M.mode) { C.rows = null; C.mode = M.mode; }
  var fpk = (M.m.rq || '') + '|' + (M.m.frq || '') + '|' + rawData.length + '|' + fp + '|' + M.rsig;
  if (!(C.rows && C.rows.fp === fpk)) {
    chunks.sort(function (x, y) { return x.k - y.k; });
    var rows = [];
    for (var c = 0; c < chunks.length; c++) {
      var lines = b64utf8(chunks[c].j).split('\n');
      for (var li = 0; li < lines.length; li++) if (lines[li] !== '') rows.push(lines[li].split('\t'));
    }
    C.rows = { fp: fpk, sig: M.rsig, cols: M.applied.cols.slice(), rows: rows, prep: {} };
    prepRows(C.rows, M.mode);
  }
  M.rows = M.ok ? C.rows : null;
  return M;
}
// Строки → блоки сотрудников: у КП со строками аллокаций — подряд идущие строки одного MasterID.
function prepRows(R, mode) {
  var ci = {}, cols = R.cols;
  for (var i = 0; i < cols.length; i++) ci[cols[i]] = i;
  R.ci = ci;
  R.perAlloc = false;
  if (mode === 'kp') for (var a = 0; a < CFG.allocKeys.length; a++) if (ci.hasOwnProperty(CFG.allocKeys[a])) R.perAlloc = true;
  var blocks = [], rows = R.rows, mi = ci.master_id === undefined ? 0 : ci.master_id;
  for (var r = 0; r < rows.length; r++) {
    var last = blocks[blocks.length - 1];
    if (R.perAlloc && last && rows[last.i][mi] === rows[r][mi]) last.n++;
    else blocks.push({ i: r, n: 1 });
  }
  R.blocks = blocks;
}
var MODEL = buildModel();
var MODE = MODEL.mode, ROWS = MODEL.rows;
var FIELDS = MODE === 'kp' ? FIELD_BASE.concat(FIELD_KP) : FIELD_BASE.slice();
var FIELD_BY = {};
for (var fi = 0; fi < FIELDS.length; fi++) FIELD_BY[FIELDS[fi].key] = FIELDS[fi];
var LOCKED = CFG.locked[MODE] || CFG.locked.us;
function labelOf(k) { return FIELD_BY[k] ? FIELD_BY[k].label : k; }
function isVirtual(k) { return inArr(CFG.virtualKeys, k); }
function isAllocKey(k) { return inArr(CFG.allocKeys, k) || isVirtual(k); }
// Колонка доступна в загруженных строках (расчётные — если есть то, из чего считать).
function loaded(k) {
  if (!ROWS) return false;
  if (k === 'sum_alloc') return ROWS.ci.hasOwnProperty('alloc');
  if (k === 'alloc_count') return ROWS.perAlloc;
  return ROWS.ci.hasOwnProperty(k);
}

// ---- применённое и запрос ----
var DEFAULT_F = { per: 'last', dt: '', emp: CFG.emp[0], tcr: '', flt: {}, mu: [], lu: [], kp: [], id: {}, cols: CFG.defaultCols.slice(),
  sort: 'master_id:asc', lim: CFG.limits[0] };
function applied() { return MODEL.applied || DEFAULT_F; }
// Сколько фильтров применено (по эху датасета) — для шапки; сами фильтры — в панели слева.
function filterCount(o) {
  var n = (o.per === 'date' ? 1 : 0) + ((o.emp || CFG.emp[0]) !== CFG.emp[0] ? 1 : 0) + (o.tcr ? 1 : 0);
  for (var a in (o.flt || {})) if (o.flt.hasOwnProperty(a) && o.flt[a].length) n++;
  n += (o.mu.length ? 1 : 0) + (o.lu.length ? 1 : 0) + (o.kp.length ? 1 : 0);
  for (var i = 0; i < ID_KEYS.length; i++) if (((o.id || {})[ID_KEYS[i]] || []).length) { n++; break; }
  return n;
}
// Колонки показа: выбор пользователя (порядок) или эхо; группировка — отдельно, над строками.
function colOrder() {
  var base = state.columnOrder || applied().cols || CFG.defaultCols, out = [];
  for (var i = 0; i < base.length; i++) if (FIELD_BY[base[i]] && !inArr(state.groupBy, base[i])) out.push(base[i]);
  for (var l = LOCKED.length - 1; l >= 0; l--) if (!inArr(out, LOCKED[l]) && !inArr(state.groupBy, LOCKED[l])) out.unshift(LOCKED[l]);
  return uniq(out);
}
function displayCols() {
  var o = colOrder(), out = [];
  for (var i = 0; i < o.length; i++) if (loaded(o[i])) out.push(o[i]);
  return out;
}
// У КП строка на аллокацию; показана хоть одна колонка аллокации — блок сотрудника в несколько
// строк, иначе — одна строка на сотрудника.
function perRowCols(cols) {
  for (var i = 0; i < cols.length; i++) if (isAllocKey(cols[i]) && !isVirtual(cols[i])) return true;
  return false;
}
// Колонки запроса: закреплённые, группировка, показ. Расчётным полям КП нужна аллокация:
// сумме — сама доля (alloc), числу аллокаций — строка на аллокацию (любое поле аллокации).
function reqCols(order) {
  var o = LOCKED.concat(state.groupBy, order || colOrder()), out = [], perRow = false;
  for (var i = 0; i < o.length; i++) {
    if (isVirtual(o[i])) continue;
    if (FIELD_BY[o[i]]) out.push(o[i]);
    if (inArr(CFG.allocKeys, o[i])) perRow = true;
  }
  if ((inArr(o, 'sum_alloc') || (inArr(o, 'alloc_count') && !perRow)) && !inArr(out, 'alloc')) out.push('alloc');
  return uniq(out);
}
// Запрос списка: колонки, сортировка, лимит (фильтры приходят от панели фильтров).
function viewNow() { var ap = applied(); return { cols: reqCols(), sort: ap.sort, lim: ap.lim }; }
// Маска кросс-фильтра списка: только свои носители (основа + meta.cf); value = [] не шлём никогда.
function maskOf(o) {
  var out = [], cf = MODEL.cf;
  function add(base, vals) {
    var v = [];
    for (var i = 0; i < (vals || []).length; i++) if (vals[i] !== null && vals[i] !== undefined && String(vals[i]) !== '') v.push(String(vals[i]));
    if (v.length) out.push({ column: base + cf, operator: 'IN', value: v });
  }
  if (o.cols && o.cols.join(',') !== CFG.defaultCols.join(',')) add('cols', o.cols);
  if (o.sort && o.sort !== 'master_id:asc') add('sort', [o.sort]);
  if (o.lim && +o.lim !== CFG.limits[0]) add('lim', [String(o.lim)]);
  add('rq', [o.rq]);
  return out;
}

// ---- таблица: значения, поиск, сортировка, группировка — из памяти ----
function cellRaw(row, key) { var i = ROWS.ci[key]; return i === undefined ? '' : (row[i] == null ? '' : row[i]); }
function blockVal(b, key) {
  if (key === 'alloc_count') return String(b.n);
  if (key === 'sum_alloc') {
    var s = 0, any = false;
    for (var r = b.i; r < b.i + b.n; r++) { var x = num(cellRaw(ROWS.rows[r], 'alloc')); if (x !== null) { s += x; any = true; } }
    return any ? String(Math.round(s * 10000) / 10000) : '';
  }
  return cellRaw(ROWS.rows[b.i], key);
}
function isMasked(v) { return v === CFG.mask; }
function keyType(k) { return inArr(CFG.numKeys, k) ? 'num' : (inArr(CFG.dateKeys, k) ? 'date' : 'text'); }
// Ключи сортировки считаются один раз на колонку; пустое и скрытое warden — всегда в конце.
function sortKeys(key) {
  var P = ROWS.prep, c = P['sk:' + key];
  if (c) return c;
  var bl = ROWS.blocks, out = new Array(bl.length), tp = keyType(key);
  for (var i = 0; i < bl.length; i++) {
    var v = isAllocKey(key) && !isVirtual(key) ? minAllocVal(bl[i], key, tp) : blockVal(bl[i], key);
    if (v === '' || isMasked(v)) out[i] = null;
    else if (tp === 'num') { var n = num(v); out[i] = n === null ? lower(v) : n; }
    else out[i] = tp === 'date' ? v : lower(v);
  }
  P['sk:' + key] = out;
  return out;
}
// У КП колонка строки аллокации сортирует сотрудника по первой (крупнейшей) аллокации.
function minAllocVal(b, key) { return cellRaw(ROWS.rows[b.i], key); }
function cmpKey(a, b) {
  if (a === b) return 0;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'number') return -1;
  if (typeof b === 'number') return 1;
  return a < b ? -1 : 1;
}
// Текст блока для поиска — по показанным колонкам, один раз на набор колонок.
function blockText(cols) {
  var P = ROWS.prep, key = 'tx:' + cols.join(','), c = P[key];
  if (c) return c;
  var bl = ROWS.blocks, out = new Array(bl.length);
  for (var i = 0; i < bl.length; i++) {
    var parts = [];
    for (var r = bl[i].i; r < bl[i].i + bl[i].n; r++) {
      for (var k = 0; k < cols.length; k++) {
        if (r > bl[i].i && !isAllocKey(cols[k])) continue;
        parts.push(isVirtual(cols[k]) ? blockVal(bl[i], cols[k]) : cellRaw(ROWS.rows[r], cols[k]));
      }
    }
    out[i] = lower(parts.join('\u0001'));
  }
  P[key] = out;
  return out;
}
// Конвейер: поиск → сортировка → группировка → (страница — при сборке разметки). Результат
// запоминается: листание страниц и перерисовка не повторяют поиск и сортировку по 25 000 строк.
function viewRows() {
  if (!ROWS) return null;
  var cols = displayCols(), ck = [];
  for (var cg in state.collapsedGroups) if (state.collapsedGroups.hasOwnProperty(cg) && state.collapsedGroups[cg]) ck.push(cg);
  var vkey = [lower(trim(state.search)), state.sortKey, state.sortDir, state.groupBy.join(','), ck.sort().join('\u0002'), cols.join(',')].join('\u0003');
  if (ROWS.prep.view && ROWS.prep.view.key === vkey) return ROWS.prep.view.V;
  var V = viewCompute(cols);
  ROWS.prep.view = { key: vkey, V: V };
  return V;
}
function viewCompute(cols) {
  var bl = ROWS.blocks, idx = [], q = lower(trim(state.search));
  var tx = q ? blockText(cols.concat(state.groupBy)) : null;
  for (var i = 0; i < bl.length; i++) if (!q || tx[i].indexOf(q) > -1) idx.push(i);
  if (state.sortKey && (loaded(state.sortKey))) {
    var ks = sortKeys(state.sortKey), dir = state.sortDir === 'desc' ? -1 : 1;
    idx.sort(function (x, y) {
      var a = ks[x], b = ks[y];
      if (a === null && b === null) return x - y;
      if (a === null) return 1;
      if (b === null) return -1;
      return dir * cmpKey(a, b) || x - y;
    });
  }
  var V = { cols: cols, idx: idx, items: null, groups: 0, gkeys: [] };
  if (state.groupBy.length) {
    var items = [], tree = {}, order = [];
    for (var j = 0; j < idx.length; j++) {
      var b = bl[idx[j]], path = [], node = { kids: tree, order: order };
      for (var g = 0; g < state.groupBy.length; g++) {
        var gv = blockVal(b, state.groupBy[g]);
        path.push(gv);
        var gk = path.join('\u0001');
        if (!node.kids[gk]) { node.kids[gk] = { key: gk, v: gv, lvl: g, n: 0, kids: {}, order: [], rows: [] }; node.order.push(gk); V.gkeys.push(gk); }
        node = node.kids[gk];
        node.n++;
      }
      node.rows.push(idx[j]);
    }
    var walk = function (kids, ord) {
      for (var o = 0; o < ord.length; o++) {
        var gn = kids[ord[o]];
        items.push({ g: gn });
        V.groups++;
        if (state.collapsedGroups[gn.key]) continue;
        if (gn.order.length) walk(gn.kids, gn.order);
        for (var rr = 0; rr < gn.rows.length; rr++) items.push({ b: gn.rows[rr], lvl: gn.lvl + 1 });
      }
    };
    walk(tree, order);
    V.items = items;
  }
  return V;
}

// ---------- БЛОК 4: ФОРМАТИРОВАНИЕ И ЦВЕТ ----------
// Тонкий пробел в разрядах, запятая в дроби.
var THIN = ' ', NBSP = ' ';
var MONTH_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
function fmtInt(v) {
  var n = num(v);
  if (n === null) return '—';
  var s = String(Math.round(Math.abs(n))), out = '';
  while (s.length > 3) { out = THIN + s.slice(-3) + out; s = s.slice(0, -3); }
  return (n < 0 ? '−' : '') + s + out;
}
function plural(n, one, few, many) {
  var a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b === 1) return one;
  if (b > 1 && b < 5) return few;
  return many;
}
// 'YYYY-MM-DD[ …]' → 'ДД.ММ.ГГГГ'; иное — как есть.
function fmtDate(v) {
  var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v || ''));
  return m ? m[3] + '.' + m[2] + '.' + m[1] : String(v == null ? '' : v);
}
function fmtDay(iso) {
  var p = toDate(iso);
  return p ? p.d + NBSP + MONTH_GEN[p.m] + ' ' + p.y : '';
}
function fmtDec(v) { return String(v).replace('.', ','); }
function fmtPct(v) { var n = num(v); return n === null ? '' : String(Math.round(n * 1000) / 10).replace('.', ',') + '%'; }
// Значение ячейки на экране.
function cellText(key, v) {
  if (v === '' || v == null) return '';
  if (inArr(CFG.dateKeys, key)) return fmtDate(v);
  if (key === 'alloc' || key === 'sum_alloc') return fmtPct(v);
  if (key === 'work_experience_year') return fmtDec(v);
  return String(v);
}
// Значение для «Копировать»: даты — ДД.ММ.ГГГГ, дроби — с запятой (Excel), скрытое — как в прежнем чарте.
function copyText(key, v) {
  if (isMasked(v)) return CFG.maskText;
  if (v === '' || v == null) return '';
  if (inArr(CFG.dateKeys, key)) return fmtDate(v);
  if (inArr(CFG.decimalKeys, key)) { var n = num(v); return n === null ? String(v) : fmtDec(String(n)); }
  return String(v);
}
function tipHtml(o) {
  var P = CFG.ns;
  return (o.title ? '<span class="' + P + '-t-h">' + esc(o.title) + '</span>' : '')
    + (o.text ? '<span class="' + P + '-t-x">' + esc(o.text) + '</span>' : '')
    + (o.html || '')
    + (o.note ? '<span class="' + P + '-t-n">' + esc(o.note) + '</span>' : '');
}
function tip(o) { return ' data-tip="' + esc(tipHtml(o)) + '"'; }
// Подсветка найденного: сначала экранировать, потом подсветить (RETRO 35).
function hl(text, q) {
  var s = String(text == null ? '' : text);
  if (!q) return esc(s);
  var at = lower(s).indexOf(q);
  if (at < 0) return esc(s);
  return esc(s.slice(0, at)) + '<mark class="' + CFG.ns + '-hl">' + esc(s.slice(at, at + q.length)) + '</mark>' + hl(s.slice(at + q.length), q);
}
function cssColor(c) {
  if (!c) return '#000';
  if (typeof c === 'string') return c;
  var a = (c.length >= 4) ? c[3] : 1;
  return 'rgba(' + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]) + ',' + a + ')';
}

// ---------- БЛОК 5: РАЗМЕТКА (<style> + HTML) ----------
// КАЖДЫЙ селектор начинается с .<ns>- или с .<ns>-root - иначе стили
// протекут в интерфейс Proteus. НИКАКИХ голых div/table/th/button.
// Стили из макета переносятся СЮДА ЦЕЛИКОМ, а не выбрасываются.
// ЦЕЛИКОМ — кроме рамки самой демо-страницы: фон/отступы body, центрирование,
// фикс-ширина внешнего контейнера НЕ переносятся. Корень остаётся width:100% —
// виджет тянется за ячейкой дашборда (RETRO 48). Оконные @media и vw/vh
// в ячейке не работают: адаптив — от контейнера (RETRO 49, RECIPES.md
// «Рамка макета ≠ рамка виджета»).
function buildCSS() {
  // Профиль виджетов Proteus Adoption (как HRBP HUB): кегли — роли CFG.fonts, веса 400 / 500 / 600,
  // контролы 34 px, поповеры 9 px радиус, тултип 7/10. Таблица списка — плотная: строка 32.
  var P = '.' + CFG.ns, C = CFG.colors, F = CFG.fonts, S = CFG.spacing;
  var SH = '0 1px 3px rgba(20,28,45,.06),0 4px 16px rgba(20,28,45,.04)';
  var SHL = '0 8px 28px rgba(20,28,45,.16)';
  return [
    '<style>',
    P + '-root{position:relative;width:100%;height:100%;box-sizing:border-box;'
            + 'font-family:' + CFG.fonts.family + ';'
            + 'font-size:' + F.body + 'px;color:' + C.ink + ';background:' + C.bg + ';display:flex;flex-direction:column;min-height:560px;}',
    P + '-root *{box-sizing:border-box;font-family:inherit;}',
    P + '-root b,' + P + '-root strong{font-weight:500;}',
    // ТУЛТИП живёт В BODY, вне -root — шрифт ему НЕ наследуется.
    // Повторяем font-family и position:fixed явно, иначе будет другой шрифт.
    P + '-tip{position:fixed;z-index:99999;pointer-events:none;opacity:0;'
           + 'font-family:' + CFG.fonts.family + ';box-sizing:border-box;'
           + 'transition:opacity .08s;'
           + 'background:' + C.card + ';border:1px solid ' + C.line + ';border-radius:9px;'
           + 'box-shadow:0 10px 30px rgba(24,33,50,.18),0 2px 6px rgba(24,33,50,.08);'
           + 'padding:7px 10px;font-size:' + F.note + 'px;line-height:1.4;color:' + C.ink2 + ';font-weight:400;'
           + 'max-width:320px;white-space:normal;word-wrap:break-word;}',
    P + '-tip b{font-weight:500;}',
    P + '-tip ' + P + '-t-h{display:block;font-size:10px;font-weight:500;letter-spacing:.3px;text-transform:uppercase;color:' + C.muted + ';margin-bottom:5px;}',
    P + '-tip ' + P + '-t-x{display:block;font-size:' + F.note + 'px;font-weight:400;color:' + C.ink2 + ';line-height:1.4;}',
    P + '-tip ' + P + '-t-n{display:block;font-size:' + F.cap + 'px;line-height:1.35;font-weight:400;color:' + C.muted + ';margin-top:5px;}',

    // ---- шапка: имя, дата данных ----
    P + '-head{background:' + C.card + ';border-bottom:1px solid ' + C.line + ';flex:0 0 auto;}',
    P + '-htop{display:flex;align-items:center;gap:10px;padding:10px 16px;flex-wrap:wrap;min-height:48px;}',
    P + '-logo{font-weight:600;font-size:' + F.title + 'px;white-space:nowrap;color:' + C.ink + ';}',
    P + '-logo small{color:' + C.muted + ';font-weight:400;font-size:' + F.note + 'px;margin-left:8px;}',
    P + '-sp{flex:1;}',
    P + '-badge{display:inline-flex;align-items:center;gap:6px;color:' + C.muted + ';font-weight:400;font-size:' + F.note + 'px;white-space:nowrap;}',
    P + '-badge b{color:' + C.ink2 + ';font-weight:500;}',
    P + '-badge+' + P + '-badge{padding-left:10px;border-left:1px solid ' + C.line + ';}',
    P + '-dd{position:relative;display:inline-block;}',
    P + '-ddb{display:inline-flex;align-items:center;gap:6px;height:34px;border:1px solid ' + C.line + ';background:' + C.card + ';border-radius:9px;padding:0 12px;font-size:' + F.control + 'px;font-weight:500;color:' + C.ink2 + ';cursor:pointer;white-space:nowrap;max-width:340px;}',
    P + '-ddb:hover{border-color:#d8dce4;}',
    P + '-ddb' + P + '-set{background:' + C.blueBg + ';color:' + C.blueTx + ';border-color:#dbe6fd;}',
    P + '-ddb' + P + '-on{border-color:' + C.act + ';}',
    // выбрано, но не применено: пунктир акцентом — ждёт «Применить»
    P + '-ddb' + P + '-chg{border-style:dashed;border-color:' + C.act + ';}',
    P + '-ddl{color:' + C.muted + ';font-weight:400;}',
    P + '-ddb' + P + '-set ' + P + '-ddl{color:#5b83dc;}',
    P + '-ddv{overflow:hidden;text-overflow:ellipsis;min-width:0;max-width:220px;}',
    P + '-ddc{color:' + C.muted2 + ';font-size:10px;}',
    P + '-x{display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;border-radius:50%;background:rgba(43,95,208,.14);color:' + C.blueTx + ';font-size:11px;line-height:1;cursor:pointer;flex:0 0 auto;}',
    P + '-x:hover{background:rgba(43,95,208,.3);}',
    P + '-cnt{display:inline-flex;align-items:center;justify-content:center;min-width:16px;height:16px;padding:0 5px;border-radius:999px;background:' + C.act + ';color:#fff;font-size:10px;font-weight:500;}',

    // ---- поповеры ----
    P + '-pop{position:absolute;top:calc(100% + 4px);left:0;z-index:40;background:' + C.card + ';border:1px solid ' + C.line + ';border-radius:9px;box-shadow:' + SHL + ';width:300px;padding:10px;cursor:default;text-align:left;outline:none;white-space:normal;}',
    P + '-pop' + P + '-wide{width:520px;}',
    P + '-pop' + P + '-rt{left:auto;right:0;}',
    P + '-poph{font-size:' + F.cap + 'px;text-transform:uppercase;letter-spacing:.4px;color:' + C.muted + ';font-weight:500;margin:2px 4px 8px;display:flex;align-items:center;gap:8px;min-height:22px;}',
    P + '-poph>span:first-child{flex:1;}',
    P + '-psearch{position:relative;display:block;margin:0 0 8px;color:' + C.muted + ';}',
    P + '-psearch svg{position:absolute;left:11px;top:50%;transform:translateY(-50%);pointer-events:none;}',
    P + '-srch{display:block;width:100%;height:30px;border:1px solid ' + C.line + ';border-radius:999px;padding:0 12px 0 30px;font-size:13px;font-weight:400;color:' + C.ink + ';margin:0;background:' + C.card + ';}',
    P + '-srch:focus{outline:none;border-color:' + C.act + ';}',
    P + '-list{max-height:340px;overflow:auto;margin:0 -4px;padding:0 4px;}',
    P + '-opt{display:flex;align-items:center;gap:8px;padding:6px 9px;border-radius:7px;cursor:pointer;font-size:' + F.control + 'px;font-weight:400;color:' + C.ink2 + ';}',
    P + '-opt:hover{background:#f4f6f9;color:' + C.ink + ';}',
    P + '-opt input{accent-color:' + C.blue + ';flex:0 0 auto;margin:0;cursor:pointer;}',
    P + '-opt' + P + '-cur{background:' + C.blueBg + ';color:' + C.blueTx + ';font-weight:500;}',
    P + '-opt' + P + '-zero{color:' + C.muted2 + ';}',
    P + '-optn{margin-left:auto;color:' + C.muted + ';font-size:' + F.note + 'px;font-variant-numeric:tabular-nums;white-space:nowrap;padding-left:8px;}',
    P + '-optt{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
    P + '-rd{display:inline-block;flex:0 0 auto;width:14px;height:14px;border-radius:50%;border:1.5px solid ' + C.muted2 + ';}',
    P + '-opt' + P + '-cur ' + P + '-rd{border:4px solid ' + C.act + ';}',
    P + '-blk{font-size:' + F.cap + 'px;font-weight:500;color:' + C.muted + ';text-transform:uppercase;letter-spacing:.3px;margin:10px 9px 2px;}',
    P + '-popf{display:flex;gap:8px;align-items:center;margin-top:8px;padding-top:8px;border-top:1px solid ' + C.line2 + ';}',
    P + '-popf>span{flex:1;font-size:11px;color:' + C.muted + ';font-weight:400;line-height:1.35;}',
    P + '-nores{padding:14px 8px;color:' + C.muted + ';font-size:' + F.note + 'px;font-weight:400;text-align:center;line-height:1.45;}',
    P + '-muted{color:' + C.muted + ';font-weight:400;}',
    // мини-вкладки внутри поповера (22 в подложке 26)
    P + '-seg{display:inline-flex;align-items:center;gap:2px;background:' + C.line2 + ';border-radius:9px;padding:2px;flex-wrap:wrap;}',
    P + '-segb{display:inline-flex;align-items:center;gap:5px;height:22px;border:0;background:transparent;padding:0 9px;border-radius:6px;font-weight:500;font-size:' + F.note + 'px;color:' + C.muted + ';cursor:pointer;text-transform:none;letter-spacing:0;white-space:nowrap;}',
    P + '-segb:hover{color:' + C.ink2 + ';}',
    P + '-segb' + P + '-on{background:' + C.card + ';color:' + C.ink + ';}',
    P + '-segb i{font-style:normal;color:' + C.act + ';}',
    // «Колонки»: группы сеткой, пресеты
    P + '-pop' + P + '-cpop{width:760px;}',
    P + '-cpt{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px;}',
    P + '-cpt ' + P + '-psearch{flex:1 1 220px;margin:0;}',
    P + '-pre{display:inline-flex;align-items:center;height:26px;padding:0 10px;border:1px solid ' + C.line + ';border-radius:999px;background:' + C.card + ';font-size:' + F.note + 'px;font-weight:500;color:' + C.ink2 + ';cursor:pointer;white-space:nowrap;}',
    P + '-pre:hover{border-color:#cfdcfb;color:' + C.act + ';}',
    P + '-pre' + P + '-on{background:' + C.blueBg + ';border-color:#dbe6fd;color:' + C.blueTx + ';}',
    P + '-cgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px;max-height:430px;overflow:auto;}',
    P + '-cg{border:1px solid ' + C.line2 + ';border-radius:9px;padding:4px;min-width:0;}',
    P + '-cgh{display:flex;align-items:center;gap:8px;padding:6px 8px;font-size:' + F.cap + 'px;text-transform:uppercase;letter-spacing:.3px;color:' + C.muted + ';font-weight:500;}',
    P + '-cgh label{display:flex;align-items:center;gap:8px;flex:1;cursor:pointer;}',
    P + '-cgh input{accent-color:' + C.blue + ';margin:0;}',
    P + '-cg ' + P + '-opt{padding:4px 8px;}',
    P + '-opt input[disabled]{cursor:default;}',

    // ---- кнопки: 34 px, поля 0 12, радиус 9 ----
    P + '-btn{display:inline-flex;align-items:center;gap:6px;height:34px;border:1px solid ' + C.line + ';background:' + C.card + ';border-radius:9px;padding:0 12px;font-weight:500;color:' + C.ink2 + ';cursor:pointer;font-size:' + F.control + 'px;white-space:nowrap;}',
    P + '-btn:hover{background:' + C.hover + ';border-color:#d8dce4;}',
    P + '-btn' + P + '-pri{background:' + C.act + ';border-color:' + C.act + ';color:#fff;}',
    P + '-btn' + P + '-pri:hover{background:#1b5cf0;}',
    P + '-btn' + P + '-ghost{border-color:transparent;color:' + C.blue + ';background:transparent;}',
    P + '-btn' + P + '-ghost:hover{background:' + C.blueBg + ';}',
    P + '-btn' + P + '-ok{color:#11804a;border-color:#bfe6cf;}',
    P + '-popf ' + P + '-btn{height:28px;padding:0 10px;}',
    P + '-btn[disabled]{opacity:.45;cursor:default;}',
    P + '-btn' + P + '-pri[disabled]:hover{background:' + C.act + ';}',
    P + '-lnk{color:' + C.act + ';cursor:pointer;font-weight:500;border:0;background:transparent;padding:0;font-size:inherit;text-transform:none;letter-spacing:0;}',
    P + '-lnk:hover{text-decoration:underline;}',
    P + '-ib{display:inline-flex;align-items:center;justify-content:center;min-width:28px;height:28px;border:1px solid ' + C.line + ';background:' + C.card + ';border-radius:7px;color:' + C.ink2 + ';cursor:pointer;padding:0 6px;font-size:13px;line-height:1;}',
    P + '-ib:hover{border-color:#cfdcfb;color:' + C.act + ';}',
    P + '-ib[disabled]{opacity:.4;cursor:default;}',
    // ---- уведомления и загрузка ----
    P + '-notes{flex:0 0 auto;}',
    P + '-note{font-size:' + F.note + 'px;color:' + C.ink2 + ';background:' + C.card + ';border:1px dashed ' + C.line + ';border-radius:9px;padding:10px 14px;margin-top:12px;line-height:1.5;}',
    P + '-note' + P + '-warn{border-style:solid;border-color:#f3d58f;background:#fff8e6;color:' + C.warnTx + ';}',
    P + '-load{display:flex;align-items:center;gap:10px;margin-top:12px;font-size:' + F.note + 'px;font-weight:500;color:' + C.act + ';}',
    P + '-load i{flex:1;height:3px;border-radius:2px;background:linear-gradient(90deg,' + C.act + ',#9dbbff,' + C.act + ');opacity:.7;}',
    P + '-busy ' + P + '-tbox{opacity:.55;transition:opacity .2s;}',
    // под фильтрами больше, чем загружено: сузить фильтры или загрузить всех
    P + '-tnote{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:8px 16px;border-bottom:1px solid ' + C.line + ';background:' + C.blueBg + ';color:' + C.blueTx + ';font-size:' + F.note + 'px;line-height:1.45;}',
    P + '-tnote' + P + '-warn{background:#fff8e6;color:' + C.warnTx + ';}',

    // ---- таблица: панель во всю оставшуюся высоту, прокрутка внутри ----
    P + '-main{flex:1 1 auto;min-width:0;min-height:0;display:flex;flex-direction:column;padding:0 16px 16px;}',
    P + '-tpan{flex:1 1 auto;min-height:380px;display:flex;flex-direction:column;background:' + C.card + ';border-radius:12px;box-shadow:' + SH + ';min-width:0;margin-top:12px;}',
    P + '-ttools{display:flex;align-items:flex-start;gap:8px;padding:12px 12px 10px 16px;border-bottom:1px solid ' + C.line + ';}',
    P + '-tcount{font-size:' + F.body + 'px;color:' + C.ink2 + ';white-space:nowrap;}',
    P + '-tcount b{font-size:' + F.title + 'px;font-weight:600;color:' + C.ink + ';font-variant-numeric:tabular-nums;}',
    P + '-tsub{color:' + C.muted + ';font-size:' + F.note + 'px;white-space:normal;}',
    P + '-tsw{position:relative;display:inline-block;width:240px;color:' + C.muted + ';}',
    P + '-tsw svg{position:absolute;left:11px;top:50%;transform:translateY(-50%);pointer-events:none;}',
    P + '-tsw ' + P + '-srch{height:34px;font-size:' + F.control + 'px;}',
    P + '-tbox{flex:1 1 auto;min-height:0;overflow:auto;position:relative;}',
    P + '-t{border-collapse:separate;border-spacing:0;table-layout:fixed;font-size:' + F.body + 'px;font-variant-numeric:tabular-nums;}',
    P + '-t th{position:sticky;top:0;z-index:3;background:' + C.card + ';font-size:' + F.cap + 'px;text-transform:uppercase;letter-spacing:.3px;color:' + C.muted + ';font-weight:500;line-height:13px;text-align:left;padding:9px 8px;border-bottom:1px solid ' + C.line + ';white-space:nowrap;overflow:hidden;text-overflow:ellipsis;user-select:none;cursor:pointer;}',
    P + '-t th:hover{color:' + C.ink2 + ';}',
    P + '-t th' + P + '-son{color:' + C.ink2 + ';}',
    P + '-t th' + P + '-num,' + P + '-t td' + P + '-num{text-align:right;}',
    P + '-t td{padding:6px 8px;height:' + S.rowH + 'px;line-height:19px;color:' + C.ink2 + ';border-bottom:1px solid ' + C.line2 + ';white-space:nowrap;overflow:hidden;text-overflow:ellipsis;vertical-align:top;background:' + C.card + ';}',
    // Первая колонка (MasterID) закреплена при горизонтальной прокрутке; у КП в строках аллокаций
    // первая ячейка — уже не MasterID, поэтому по классу, а не :first-child.
    P + '-t th' + P + '-c0,' + P + '-t td' + P + '-c0{position:sticky;left:0;z-index:2;box-shadow:inset -1px 0 0 ' + C.line2 + ';}',
    P + '-t th' + P + '-c0{z-index:4;}',
    P + '-t td' + P + '-c0{color:' + C.ink + ';font-weight:500;}',
    P + '-t tbody:hover td{background:' + C.rowHover + ';}',
    P + '-t tbody' + P + '-bk td{border-top:0;}',
    P + '-t tr' + P + '-sub td{border-top:1px dashed ' + C.line2 + ';}',
    P + '-t tr' + P + '-g td{background:' + C.grp + ';color:' + C.ink + ';font-weight:500;cursor:pointer;height:30px;}',
    // строка группы не обрезается узкой таблицей (одна колонка): подпись идёт дальше вправо
    P + '-t tr' + P + '-g td{overflow:visible;text-overflow:clip;}',
    P + '-t tbody:hover tr' + P + '-g td{background:#eef1f8;}',
    P + '-gc{display:inline-block;width:14px;color:' + C.muted + ';font-size:10px;}',
    P + '-gl{color:' + C.muted + ';font-weight:400;margin-right:4px;}',
    P + '-gn{display:inline-flex;align-items:center;height:18px;padding:0 7px;border-radius:999px;background:' + C.blueBg + ';color:' + C.blueTx + ';font-size:' + F.note + 'px;margin-left:8px;}',
    P + '-sa{color:' + C.act + ';margin-left:4px;font-size:11px;}',
    P + '-thl{overflow:hidden;text-overflow:ellipsis;}',
    P + '-rsz{position:absolute;top:0;right:0;width:8px;height:100%;cursor:col-resize;z-index:5;}',
    P + '-rsz:hover{background:rgba(43,108,255,.25);}',
    P + '-t th' + P + '-dragover{box-shadow:inset 3px 0 0 ' + C.act + ';}',
    P + '-t th' + P + '-dragsrc,' + P + '-gchip' + P + '-dragsrc{opacity:.45;}',
    P + '-mask{color:' + C.muted2 + ';font-weight:400;}',
    P + '-hl{background:' + C.hl + ';color:' + C.actInk + ';border-radius:3px;padding:0 1px;}',
    P + '-a{color:' + C.act + ';text-decoration:none;font-weight:500;}',
    P + '-a:hover{text-decoration:underline;}',
    P + '-empty{padding:40px 24px;text-align:center;color:' + C.muted + ';font-size:' + F.body + 'px;line-height:1.5;}',
    P + '-empty b{display:block;color:' + C.ink + ';font-size:15px;font-weight:600;margin-bottom:8px;}',
    // ---- страницы ----
    // ---- вторая строка панели: зона группировки слева, страницы справа ----
    P + '-tbar{display:flex;align-items:center;gap:8px 12px;flex-wrap:wrap;padding:8px 12px 8px 16px;border-bottom:1px solid ' + C.line + ';}',
    P + '-gz{flex:1 1 340px;min-width:0;display:flex;align-items:center;gap:6px;flex-wrap:wrap;min-height:34px;padding:3px 8px;border:1px dashed ' + C.line + ';border-radius:9px;color:' + C.muted + ';font-size:' + F.note + 'px;transition:background .12s,border-color .12s;}',
    P + '-gz' + P + '-gset{border-style:solid;border-color:' + C.line2 + ';background:' + C.hover + ';}',
    P + '-gz' + P + '-gzon{border-style:dashed;border-color:' + C.act + ';background:' + C.blueBg + ';}',
    P + '-gzh{white-space:nowrap;}',
    P + '-gze{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;}',
    P + '-gchip{display:inline-flex;align-items:center;gap:6px;height:26px;padding:0 5px 0 10px;border-radius:999px;background:' + C.blueBg + ';color:' + C.blueTx + ';font-weight:500;cursor:grab;white-space:nowrap;border:1px solid #dbe6fd;}',
    P + '-gchip' + P + '-dragover{box-shadow:inset 3px 0 0 ' + C.act + ';}',
    P + '-gsep{color:' + C.muted2 + ';}',
    P + '-gz ' + P + '-dd{margin-left:auto;}',
    P + '-gadd{display:inline-flex;align-items:center;height:26px;padding:0 8px;border:0;border-radius:7px;background:transparent;color:' + C.act + ';font-size:' + F.note + 'px;font-weight:500;cursor:pointer;white-space:nowrap;}',
    P + '-gadd:hover,' + P + '-gadd' + P + '-on{background:' + C.blueBg + ';}',
    P + '-gall{width:28px;padding:0;color:' + C.muted + ';font-size:11px;}',
    P + '-pager{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-left:auto;font-size:' + F.note + 'px;color:' + C.muted + ';}',
    P + '-pgi{color:' + C.ink2 + ';font-weight:500;font-variant-numeric:tabular-nums;margin:0 4px;white-space:nowrap;}',
    // первая строка панели: слева итог и контролы (переносятся), справа — «Копировать» иконкой, всегда на месте
    P + '-tl{flex:1 1 auto;min-width:0;display:flex;align-items:center;gap:8px;flex-wrap:wrap;}',
    P + '-ib' + P + '-copy{flex:0 0 auto;width:34px;min-width:34px;height:34px;padding:0;border-radius:9px;}',
    P + '-ib' + P + '-copy' + P + '-ok{color:#11804a;border-color:#bfe6cf;}',
    P + '-ib' + P + '-copy' + P + '-bad{color:' + C.warnTx + ';border-color:#f3d58f;}',

    // ---- тур «Как работать» (как в HRBP HUB): кнопка в шапке, слой тура ----
    P + '-help{color:' + C.act + ';}',
    P + '-help:hover{background:' + C.blueBg + ';border-color:#cfdcfb;}',
    // Слой тура живёт В BODY, как тултип: шрифт и position:fixed — явно. Затемнение — четыре
    // шторки вокруг цели (клик мимо цели не проходит), пятая — поверх цели, если она «только смотреть».
    P + '-tour{font-family:' + CFG.fonts.family + ';display:none;}',
    P + '-tour *{box-sizing:border-box;font-family:inherit;}',
    P + '-tb{position:fixed;left:0;top:0;width:0;height:0;z-index:99990;background:rgba(17,24,39,.55);transition:left .2s,top .2s,width .2s,height .2s;}',
    P + '-tb[data-tb="h"]{background:transparent;cursor:default;}',
    P + '-tring{position:fixed;z-index:99991;border-radius:10px;box-shadow:0 0 0 2px ' + C.act + ',0 0 0 6px rgba(43,108,255,.22);pointer-events:none;transition:left .2s,top .2s,width .2s,height .2s;}',
    P + '-tcard{position:fixed;z-index:99992;width:340px;max-width:calc(100vw - 24px);background:' + C.card + ';border-radius:12px;'
      + 'box-shadow:0 18px 50px rgba(15,23,42,.28),0 2px 8px rgba(15,23,42,.12);padding:12px 16px 14px;color:' + C.ink2 + ';font-size:' + F.body + 'px;line-height:1.5;font-weight:400;}',
    P + '-tarr{position:absolute;display:none;width:10px;height:10px;background:' + C.card + ';transform:rotate(45deg);}',
    P + '-tarr' + P + '-ta-bottom{display:block;top:-5px;}',
    P + '-tarr' + P + '-ta-top{display:block;bottom:-5px;}',
    P + '-tarr' + P + '-ta-right{display:block;left:-5px;}',
    P + '-tarr' + P + '-ta-left{display:block;right:-5px;}',
    P + '-tch{display:flex;align-items:center;gap:8px;margin:0 -6px 4px 0;}',
    P + '-tcs{font-size:' + F.cap + 'px;text-transform:uppercase;letter-spacing:.4px;color:' + C.muted + ';font-weight:500;}',
    P + '-tx{margin-left:auto;font-size:12px;}',
    P + '-tct{font-size:' + F.title + 'px;font-weight:600;color:' + C.ink + ';margin:0 0 4px;}',
    P + '-tcx b{font-weight:500;color:' + C.ink + ';}',
    P + '-tul{margin:6px 0 0;padding-left:18px;}',
    P + '-tul li{margin:0 0 6px;}',
    P + '-tchint{margin-top:8px;font-size:' + F.note + 'px;color:' + C.act + ';font-weight:500;}',
    P + '-tcf{display:flex;justify-content:flex-end;gap:8px;margin-top:12px;}',
    P + '-tcf ' + P + '-btn{height:30px;padding:0 12px;}',
    P + '-tcf ' + P + '-btn:first-child{margin-right:auto;}',
    // Показ «нажми — будет»: курсор едет к цели и «нажимает» (кольцо), затем клик по-настоящему.
    P + '-tcur{position:fixed;z-index:99993;display:none;left:0;top:0;pointer-events:none;transition:left .65s cubic-bezier(.3,.7,.2,1),top .65s cubic-bezier(.3,.7,.2,1);filter:drop-shadow(0 2px 3px rgba(0,0,0,.3));}',
    P + '-tclk{position:fixed;z-index:99993;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;border:2px solid ' + C.act + ';pointer-events:none;opacity:0;}',
    '</style>'
  ].join('');
}

var SEARCH_SVG = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true">'
  + '<circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.5" y2="16.5"/></svg>';
var COPY_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">'
  + '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/></svg>';
function hSearch(kind, placeholder, value) {
  var P = CFG.ns;
  return '<label class="' + P + '-psearch">' + SEARCH_SVG + '<input class="' + P + '-srch" type="text" autocomplete="off" data-psearch="' + kind
    + '" placeholder="' + esc(placeholder) + '" value="' + esc(value == null ? state.q : value) + '"></label>';
}
// Кнопка-открыватель поповера: o = {key, label, value, set, chg, tip, clear}.
function ddButton(o) {
  var P = CFG.ns, open = state.open === o.key;
  return '<button class="' + P + '-ddb' + (o.set ? ' ' + P + '-set' : '') + (o.chg ? ' ' + P + '-chg' : '') + (open ? ' ' + P + '-on' : '')
    + '" data-action="open" data-pop="' + o.key + '" aria-haspopup="true" aria-expanded="' + (open ? 'true' : 'false') + '"'
    + (open || !o.tip ? '' : tip(o.tip)) + '>'
    + (o.label ? '<span class="' + P + '-ddl">' + esc(o.label) + '</span>' : '')
    + '<span class="' + P + '-ddv">' + (o.html || esc(o.value)) + '</span>'
    + (o.clear ? '<span class="' + P + '-x" role="button" tabindex="0" aria-label="Снять фильтр" data-action="chipx" data-key="' + o.clear + '">×</span>'
      : '<span class="' + P + '-ddc">▾</span>')
    + '</button>';
}
var CHECK_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
  + '<path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
var HELP_SVG = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
  + '<circle cx="12" cy="12" r="9.5"/><path d="M9.3 9.2a2.8 2.8 0 0 1 5.4 1c0 1.9-2.7 2.6-2.7 2.6"/><path d="M12 16.6h.01"/></svg>';
// Шапка — как в HRBP HUB и Proteus Adoption: имя вкладки слева; справа «Как работать» (тур) и плашки
// данных: дата данных, период (если на дату), сколько фильтров применено, приветствие.
function headHTML() {
  var P = CFG.ns, m = MODEL.m, n = filterCount(applied()), s = '<div class="' + P + '-head">';
  s += '<div class="' + P + '-htop"><span class="' + P + '-logo">' + esc(CFG.title[MODE]) + '<small>' + esc(CFG.sub[MODE]) + '</small></span>';
  s += '<span class="' + P + '-sp"></span>';
  if (MODEL.ok) {
    s += '<button type="button" class="' + P + '-btn ' + P + '-help" data-tact="tour" data-tour="help"'
      + tip({ title: 'Как работать со списком', text: 'Тур по списку: по очереди подсветим элементы и расскажем, что будет по клику.' })
      + '>' + HELP_SVG + 'Как работать</button>';
  }
  if (m.data_dt) s += '<span class="' + P + '-badge"' + tip({ title: 'Данные', text: 'Последний день в таблице списка: ' + fmtDay(m.data_dt) + '.' }) + '>Данные на <b>' + esc(fmtDay(m.data_dt)) + '</b></span>';
  if (m.per === 'date' && m.dt) s += '<span class="' + P + '-badge"' + tip({ title: 'Период', text: 'Сотрудники на дату ' + fmtDate(m.dt) + ' — фильтр «Период» в панели фильтров.' }) + '>Период: <b>на ' + esc(fmtDate(m.dt)) + '</b></span>';
  s += '<span class="' + P + '-badge"' + tip({ title: 'Фильтры', text: n ? 'Применено фильтров: ' + n + ' — в панели фильтров слева.' : 'Фильтров нет — все сотрудники.' }) + '>Фильтров: <b>' + n + '</b></span>';
  if (m.first_nm) s += '<span class="' + P + '-badge">Привет, <b>' + esc(m.first_nm) + '</b></span>';
  return s + '</div></div>';
}
function noticesHTML() {
  var P = CFG.ns, s = '';
  if (state.pend) s += '<div class="' + P + '-load"><span>' + esc(state.pend.kind === 'filters' ? CFG.text.loading : 'Загружаю строки…') + '</span><i></i></div>';
  if (state.warn) s += '<div class="' + P + '-note ' + P + '-warn">' + esc(state.warn) + '</div>';
  if (MODEL.m && !MODEL.ok) s += '<div class="' + P + '-note ' + P + '-warn">' + esc(CFG.text.noAccess) + '</div>';
  return s ? '<div class="' + P + '-notes">' + s + '</div>' : '';
}

// ---- таблица: итог, лимит, поиск, колонки, группировка, «Копировать» ----
function sortNow() {
  if (state.sortKey) return { key: state.sortKey, dir: state.sortDir || 'asc', local: true };
  var p = String(applied().sort || 'master_id:asc').split(':');
  return { key: p[0], dir: p[1] === 'desc' ? 'desc' : 'asc', local: false };
}
function limDDHTML() {
  var P = CFG.ns, ap = applied(), s = '<div class="' + P + '-dd" data-scope="lim">' + ddButton({ key: 'lim', label: 'Загружать:', value: fmtInt(ap.lim),
    tip: { title: 'Сколько сотрудников загружать', text: 'Первые сотрудники под фильтрами в текущей сортировке. Больше строк — дольше загрузка; «Копировать» берёт все загруженные.' } });
  if (state.open === 'lim') {
    s += '<div class="' + P + '-pop" tabindex="-1"><div class="' + P + '-poph"><span>Загружать сотрудников</span></div>';
    for (var i = 0; i < CFG.limits.length; i++) {
      s += '<div class="' + P + '-opt' + (CFG.limits[i] === ap.lim ? ' ' + P + '-cur' : '') + '" data-action="setlim" data-key="' + CFG.limits[i] + '">'
        + '<span class="' + P + '-rd"></span><span class="' + P + '-optt">' + fmtInt(CFG.limits[i]) + '</span></div>';
    }
    s += '<div class="' + P + '-popf"><span>Сразу, одним запросом. Колонок меньше — загрузка быстрее.</span></div></div>';
  }
  return s + '</div>';
}
function colGroups(q) {
  var groups = [], by = {};
  for (var i = 0; i < FIELDS.length; i++) {
    var f = FIELDS[i];
    if (q && lower(f.label).indexOf(q) < 0 && lower(f.key).indexOf(q) < 0) continue;
    if (!by[f.group]) { by[f.group] = { name: f.group, items: [] }; groups.push(by[f.group]); }
    by[f.group].items.push(f);
  }
  return groups;
}
function presetCols(p) {
  var out = LOCKED.slice();
  for (var i = 0; i < p.cols.length; i++) if (FIELD_BY[p.cols[i]] && !inArr(out, p.cols[i])) out.push(p.cols[i]);
  return out;
}
function colGridHTML() {
  var P = CFG.ns, draft = state.colDraft || colOrder(), q = lower(trim(state.colQ)), gs = colGroups(q), s = '';
  for (var g = 0; g < gs.length; g++) {
    var on = 0;
    for (var c = 0; c < gs[g].items.length; c++) if (inArr(draft, gs[g].items[c].key)) on++;
    s += '<div class="' + P + '-cg"><div class="' + P + '-cgh"><label><input type="checkbox" data-colg="' + esc(gs[g].name) + '"'
      + (on === gs[g].items.length ? ' checked' : '') + '><span>' + esc(gs[g].name) + '</span></label><span>' + on + '/' + gs[g].items.length + '</span></div>';
    for (var i = 0; i < gs[g].items.length; i++) {
      var f = gs[g].items[i], lk = inArr(LOCKED, f.key);
      s += '<label class="' + P + '-opt"><input type="checkbox" data-colk="' + f.key + '"' + (inArr(draft, f.key) ? ' checked' : '') + (lk ? ' disabled' : '') + '>'
        + '<span class="' + P + '-optt">' + hl(f.label, q) + '</span></label>';
    }
    s += '</div>';
  }
  return s || '<div class="' + P + '-nores">Таких колонок нет</div>';
}
function colCountText() {
  var draft = state.colDraft || colOrder(), miss = 0;
  for (var i = 0; i < draft.length; i++) if (!loaded(draft[i])) miss++;
  return 'Выбрано: ' + draft.length + (miss ? ' · ' + miss + ' ' + plural(miss, 'новая загрузится', 'новые загрузятся', 'новых загрузятся') + ' одним запросом' : ' · без запроса');
}
function colsDDHTML() {
  var P = CFG.ns, n = colOrder().length, s = '<div class="' + P + '-dd" data-scope="cols">'
    + ddButton({ key: 'cols', label: '', html: 'Колонки <span class="' + P + '-cnt">' + n + '</span>',
      tip: { title: 'Колонки таблицы', text: 'Открытие — только MasterID и дата найма. Добавить колонки — один короткий запрос; убрать и переставить — сразу, без запроса.' } });
  if (state.open === 'cols') {
    var draft = state.colDraft || colOrder();
    s += '<div class="' + P + '-pop ' + P + '-cpop ' + P + '-rt" tabindex="-1"><div class="' + P + '-poph"><span>Колонки таблицы</span>'
      + '<button class="' + P + '-lnk" data-action="colreset">По умолчанию — ' + CFG.defaultCols.length + '</button></div><div class="' + P + '-cpt">'
      + hSearch('cols', 'Поиск колонки', state.colQ);
    for (var i = 0; i < CFG.presets.length; i++) {
      var p = CFG.presets[i];
      if (p.only && p.only !== MODE) continue;
      s += '<button class="' + P + '-pre' + (sameSet(presetCols(p), draft) ? ' ' + P + '-on' : '') + '" data-action="preset" data-key="' + i + '">' + esc(p.name) + '</button>';
    }
    s += '</div><div class="' + P + '-cgrid" data-plist="cols">' + colGridHTML() + '</div>'
      + '<div class="' + P + '-popf"><span data-pcount="1">' + colCountText() + '</span>'
      + '<button class="' + P + '-btn ' + P + '-pri" data-action="colapply">Показать</button></div></div>';
  }
  return s + '</div>';
}
function groupable() {
  var out = [], cand = state.groupBy.concat(colOrder());
  for (var i = 0; i < cand.length; i++) {
    var k = cand[i];
    if (k === 'master_id' || isAllocKey(k) || inArr(out, k) || !FIELD_BY[k]) continue;
    out.push(k);
  }
  return out;
}
// Колонку можно сгруппировать: не MasterID, не поле аллокации, ещё не в группировке, уровней меньше предела.
function canGroup(k) {
  return !!FIELD_BY[k] && k !== 'master_id' && !isAllocKey(k) && !inArr(state.groupBy, k) && state.groupBy.length < CFG.maxGroup;
}
// «+ колонка» в зоне группировки: то же без перетаскивания (список показанных колонок).
function groupDDHTML() {
  var P = CFG.ns, n = state.groupBy.length, open = state.open === 'group', s = '<div class="' + P + '-dd" data-scope="group">'
    + '<button type="button" class="' + P + '-gadd' + (open ? ' ' + P + '-on' : '') + '" data-action="open" data-pop="group" aria-haspopup="true" aria-expanded="' + (open ? 'true' : 'false') + '"'
    + (open ? '' : tip({ title: 'Группировка', text: 'Выбрать колонки списком — до ' + CFG.maxGroup + ' уровней, без запроса.' })) + '>+ колонка</button>';
  if (open) {
    var list = groupable();
    s += '<div class="' + P + '-pop ' + P + '-rt" tabindex="-1"><div class="' + P + '-poph"><span>Группировать по</span></div><div class="' + P + '-list">';
    for (var i = 0; i < list.length; i++) {
      var at = state.groupBy.indexOf(list[i]);
      s += '<label class="' + P + '-opt"><input type="checkbox" data-grp="' + list[i] + '"' + (at > -1 ? ' checked' : '')
        + (at < 0 && n >= CFG.maxGroup ? ' disabled' : '') + '><span class="' + P + '-optt">' + esc(labelOf(list[i])) + '</span>'
        + (at > -1 ? '<span class="' + P + '-optn">' + (at + 1) + '</span>' : '') + '</label>';
    }
    if (!list.length) s += '<div class="' + P + '-nores">Добавьте колонки — по ним можно группировать</div>';
    s += '</div><div class="' + P + '-popf"><span>Только вид, без запроса. Или перетащите заголовок колонки в зону группировки.</span></div></div>';
  }
  return s + '</div>';
}
// Все группы свёрнуты (для общей каретки).
function allFolded(V) {
  if (!V || !V.gkeys || !V.gkeys.length) return false;
  for (var i = 0; i < V.gkeys.length; i++) if (!state.collapsedGroups[V.gkeys[i]]) return false;
  return true;
}
// Зона группировки над таблицей (как в прежнем чарте): перетащите сюда заголовок — строки сгруппируются;
// плашки — уровни по порядку (тянуть — переставить, обратно на заголовки — снять, × — снять);
// общая каретка слева сворачивает и разворачивает все группы.
function gzoneInner(V) {
  var P = CFG.ns, n = state.groupBy.length, s = '';
  if (n) {
    var fold = allFolded(V);
    s += '<button type="button" class="' + P + '-ib ' + P + '-gall" data-action="gall" aria-label="' + (fold ? 'Развернуть все группы' : 'Свернуть все группы') + '"'
      + tip({ title: fold ? 'Развернуть все' : 'Свернуть все', text: fold ? 'Раскрыть все группы и строки в них.' : 'Свернуть все группы до заголовков — видно, сколько сотрудников в каждой.' })
      + '>' + (fold ? '▸' : '▾') + '</button><span class="' + P + '-gzh">Группировка:</span>';
    for (var i = 0; i < n; i++) {
      var k = state.groupBy[i];
      if (i) s += '<span class="' + P + '-gsep">›</span>';
      s += '<span class="' + P + '-gchip" draggable="true" data-gcol="' + k + '"'
        + tip({ title: labelOf(k), text: 'Уровень ' + (i + 1) + '. Перетащите — поменять порядок; на заголовки таблицы — снять группировку.' })
        + '>' + esc(labelOf(k)) + '<span class="' + P + '-x" role="button" tabindex="0" aria-label="Снять группировку" data-action="gdel" data-key="' + k + '">×</span></span>';
    }
  } else s += '<span class="' + P + '-gzh ' + P + '-gze"' + tip({ title: 'Группировка', text: 'Перетащите сюда заголовок колонки — строки сгруппируются по её значениям, до ' + CFG.maxGroup + ' уровней. Без запроса.' })
    + '>Перетащите сюда заголовок колонки, чтобы сгруппировать</span>';
  return s + (n < CFG.maxGroup ? groupDDHTML() : '');
}
function gzoneHTML(V) {
  var P = CFG.ns;
  return '<div class="' + P + '-gz' + (state.groupBy.length ? ' ' + P + '-gset' : '') + '" data-gzone="1">' + gzoneInner(V) + '</div>';
}
// Ширина колонки: заданная мышью или по типу, но не уже подписи шапки (капитель ~7 px на знак).
function colW(k) {
  if (state.colW[k]) return state.colW[k];
  var base = 160;
  if (k === 'master_id') base = 112;
  else if (inArr(CFG.dateKeys, k) || k === 'alloc' || k === 'sum_alloc' || k === 'alloc_count') base = 116;
  else if (keyType(k) === 'num') base = 104;
  else if (/_unit_nm$|^kp\d+$|full_nm|address|position_nm|_desc$|_nm$/.test(k)) base = 220;
  return Math.max(base, Math.min(260, Math.round(labelOf(k).length * 7 + 34)));
}
function cellHTML(key, v, q) {
  var P = CFG.ns;
  if (isMasked(v)) return '<span class="' + P + '-mask">⛔ нет доступа</span>';
  if (key === 'my_link' && /^https?:\/\//i.test(v)) return '<a class="' + P + '-a" href="' + esc(v) + '" target="_blank" rel="noopener noreferrer">майти ↗</a>';
  return hl(cellText(key, v), q);
}
// Блок сотрудника: у КП со показанными колонками аллокации — строка на аллокацию, иначе одна.
function blockHTML(b, cols, q, perRow) {
  var P = CFG.ns, s = '<tbody class="' + P + '-bk">', bn = perRow ? b.n : 1;
  for (var r = b.i; r < b.i + bn; r++) {
    s += '<tr' + (r > b.i ? ' class="' + P + '-sub"' : '') + '>';
    for (var c = 0; c < cols.length; c++) {
      var key = cols[c], per = isAllocKey(key) && !isVirtual(key);
      if (r > b.i && !per) continue;
      var v = isVirtual(key) ? blockVal(b, key) : cellRaw(ROWS.rows[r], key), cls = [];
      if (c === 0) cls.push(P + '-c0');
      if (keyType(key) === 'num') cls.push(P + '-num');
      s += '<td' + (cls.length ? ' class="' + cls.join(' ') + '"' : '') + (bn > 1 && !per ? ' rowspan="' + bn + '"' : '') + '>' + cellHTML(key, v, q) + '</td>';
    }
    s += '</tr>';
  }
  return s + '</tbody>';
}
function pageSlice(V) {
  var total = V.items ? V.items.length : V.idx.length, ps = state.pageSize || 100;
  var pages = Math.max(1, Math.ceil(total / ps)), pg = Math.max(0, Math.min(state.page || 0, pages - 1));
  state.page = pg;
  return { total: total, pages: pages, pg: pg, from: pg * ps, to: Math.min(total, pg * ps + ps) };
}
function tableInnerHTML(V) {
  var P = CFG.ns;
  if (!ROWS) return '<div class="' + P + '-empty"><b>' + (state.pend ? 'Загружаю строки…' : 'Строк нет') + '</b>'
    + (state.pend ? '' : 'Ответ пришёл без строк списка — обновите страницу.') + '</div>';
  if (!ROWS.blocks.length) return '<div class="' + P + '-empty"><b>Никого не нашлось</b>Под выбранные фильтры не попал ни один сотрудник.</div>';
  if (!V.idx.length) return '<div class="' + P + '-empty"><b>Ничего не найдено</b>По запросу «' + esc(state.search) + '» в загруженных строках ничего нет.</div>';
  var cols = V.cols, q = lower(trim(state.search)), sn = sortNow(), pgs = pageSlice(V), per = perRowCols(cols), W = 0, s = '<colgroup>';
  for (var c = 0; c < cols.length; c++) { var w = colW(cols[c]); W += w; s += '<col style="width:' + w + 'px">'; }
  s += '</colgroup><thead><tr>';
  for (var h = 0; h < cols.length; h++) {
    var k = cols[h], on = sn.key === k, cls = [P + '-sth'];
    if (h === 0) cls.push(P + '-c0');
    if (on) cls.push(P + '-son');
    if (keyType(k) === 'num') cls.push(P + '-num');
    s += '<th class="' + cls.join(' ') + '" data-col="' + k + '" draggable="true" data-action="sort" data-key="' + k + '"'
      + tip({ title: labelOf(k), text: (on ? (sn.dir === 'asc' ? 'По возрастанию' : 'По убыванию') + (sn.local ? ' (загруженные)' : ' (на сервере)') + '. ' : '')
        + 'Клик — сортировка, перетащите — порядок, край — ширина.' })
      + '><span class="' + P + '-thl">' + esc(labelOf(k)) + '</span>' + (on ? '<span class="' + P + '-sa">' + (sn.dir === 'asc' ? '↑' : '↓') + '</span>' : '')
      + '<i class="' + P + '-rsz" data-rsz="' + k + '"></i></th>';
  }
  s += '</tr></thead>';
  var bl = ROWS.blocks;
  if (V.items) {
    for (var i = pgs.from; i < pgs.to; i++) {
      var it = V.items[i];
      if (it.g) {
        var g = it.g, gk = state.groupBy[g.lvl], fold = !!state.collapsedGroups[g.key];
        s += '<tbody><tr class="' + P + '-g" data-action="grp" data-key="' + esc(g.key) + '"><td colspan="' + cols.length + '" style="padding-left:' + (10 + g.lvl * 18) + 'px">'
          + '<span class="' + P + '-gc">' + (fold ? '▸' : '▾') + '</span><span class="' + P + '-gl">' + esc(labelOf(gk)) + ':</span>'
          + (isMasked(g.v) ? '<span class="' + P + '-mask">⛔ нет доступа</span>' : esc(cellText(gk, g.v) || '(пусто)'))
          + '<span class="' + P + '-gn">' + fmtInt(g.n) + '</span></td></tr></tbody>';
      } else s += blockHTML(bl[it.b], cols, q, per);
    }
  } else {
    for (var j = pgs.from; j < pgs.to; j++) s += blockHTML(bl[V.idx[j]], cols, q, per);
  }
  return '<table class="' + P + '-t" style="width:' + W + 'px">' + s + '</table>';
}
// Страницы — над таблицей, справа во второй строке панели: размер страницы, диапазон, стрелки.
function pagerHTML(V) {
  var P = CFG.ns, s = '<span class="' + P + '-seg"' + tip({ title: 'Строк на странице', text: 'Только вид: все загруженные строки уже в чарте.' }) + '>';
  for (var i = 0; i < CFG.pageSizes.length; i++) {
    var ps = CFG.pageSizes[i];
    s += '<button class="' + P + '-segb' + (ps === state.pageSize ? ' ' + P + '-on' : '') + '" data-action="ps" data-key="' + ps + '" role="tab" aria-selected="' + (ps === state.pageSize ? 'true' : 'false') + '">' + ps + '</button>';
  }
  s += '</span>';
  if (V && ROWS && V.idx.length) {
    var p = pageSlice(V);
    s += '<span class="' + P + '-pgi">' + fmtInt(p.from + 1) + '–' + fmtInt(p.to) + ' из ' + fmtInt(p.total) + '</span>'
      + '<button class="' + P + '-ib" data-action="pg" data-key="first"' + (p.pg ? '' : ' disabled') + ' aria-label="Первая страница">«</button>'
      + '<button class="' + P + '-ib" data-action="pg" data-key="prev"' + (p.pg ? '' : ' disabled') + ' aria-label="Назад">‹</button>'
      + '<button class="' + P + '-ib" data-action="pg" data-key="next"' + (p.pg < p.pages - 1 ? '' : ' disabled') + ' aria-label="Вперёд">›</button>'
      + '<button class="' + P + '-ib" data-action="pg" data-key="last"' + (p.pg < p.pages - 1 ? '' : ' disabled') + ' aria-label="Последняя страница">»</button>';
  }
  return s;
}
function countHTML(V) {
  var P = CFG.ns, t = MODEL.total, got = ROWS ? ROWS.blocks.length : 0, sn = sortNow(), s = '<b>' + fmtInt(t) + '</b> ' + plural(t, 'сотрудник', 'сотрудника', 'сотрудников');
  var sub = [];
  if (ROWS && got < t) {
    var sp = String(applied().sort).split(':');
    sub.push('в таблице первые ' + fmtInt(got) + ' по «' + labelOf(sp[0]) + '» ' + (sp[1] === 'desc' ? '↓' : '↑'));
  }
  if (ROWS && trim(state.search)) sub.push('найдено ' + fmtInt(V ? V.idx.length : 0));
  if (sn.local) sub.push('сортировка загруженных');
  return s + (sub.length ? '<span class="' + P + '-tsub"> · ' + esc(sub.join(' · ')) + '</span>' : '');
}
// Загружены не все под фильтрами: больше последнего лимита — сузить фильтры; иначе — загрузить всех.
function limNoteHTML() {
  var P = CFG.ns, t = MODEL.total, got = ROWS ? ROWS.blocks.length : 0, max = CFG.limits[CFG.limits.length - 1];
  if (!ROWS || got >= t) return '';
  if (t > max) return '<div class="' + P + '-tnote ' + P + '-warn" data-tnote="1">' + esc(CFG.text.over.replace('{max}', fmtInt(max))) + '</div>';
  var lim = max;
  for (var i = 0; i < CFG.limits.length; i++) if (CFG.limits[i] >= t) { lim = CFG.limits[i]; break; }
  return '<div class="' + P + '-tnote" data-tnote="1"><span>' + esc(CFG.text.part.replace('{got}', fmtInt(got)).replace('{total}', fmtInt(t))) + '</span>'
    + '<button class="' + P + '-lnk" data-action="setlim" data-key="' + lim + '">Загрузить всех — ' + fmtInt(t) + '</button></div>';
}
// «Копировать» — иконкой, всегда справа в первой строке панели; итог копирования — в подсказке и цветом.
function copyBtnHTML(V) {
  var P = CFG.ns, ok = /^Скопировано/.test(state.copied || ''), on = !!(ROWS && V && V.idx.length);
  return '<button type="button" class="' + P + '-ib ' + P + '-copy' + (state.copied ? ' ' + P + (ok ? '-ok' : '-bad') : '') + '" data-action="copy" aria-label="Копировать"'
    + (on ? '' : ' disabled') + tip({ title: state.copied || 'Копировать',
      text: 'Все загруженные строки (с учётом поиска по таблице), в текущем порядке строк и колонок — для вставки в Excel.' })
    + '>' + (ok ? CHECK_SVG : COPY_SVG) + '</button>';
}
function tableHTML() {
  var P = CFG.ns, V = viewRows(), s = '<div class="' + P + '-tpan">';
  s += '<div class="' + P + '-ttools"><div class="' + P + '-tl"><span class="' + P + '-tcount" data-tcount="1">' + countHTML(V) + '</span>' + limDDHTML()
    + '<span class="' + P + '-sp"></span>'
    + '<label class="' + P + '-tsw">' + SEARCH_SVG + '<input class="' + P + '-srch" type="text" autocomplete="off" data-tsearch="1" placeholder="Поиск по таблице" value="' + esc(state.search) + '"></label>'
    + colsDDHTML() + '</div>' + copyBtnHTML(V) + '</div>';
  s += '<div class="' + P + '-tbar">' + gzoneHTML(V) + '<div class="' + P + '-pager" data-pager="1">' + pagerHTML(V) + '</div></div>';
  s += limNoteHTML();
  s += '<div class="' + P + '-tbox" data-tbox="1">' + tableInnerHTML(V) + '</div></div>';
  return s;
}

// ---- тур «Как работать» (движок — как в HRBP HUB, БЛОК 6) ----
// Шаг: sel — селектор внутри overlay (или функция), all — подсветить все совпадения, pad — поле рамки,
// lock — подсвеченное не кликается (там запрос), demo — «нажми — будет»: «Показать» кликает цель сам,
// done(key) — что считается сделанным, hint — «попробуйте сами»; need — показывать ли шаг (только то, что сам тур не меняет, иначе список шагов съедет).
// Цель не нашлась (нет строк) — шаг пропускается. Панель фильтров — соседний чарт (свой iframe):
// подсветить её отсюда нельзя, о ней — первый шаг.
function tourIntroHTML() {
  var ap = applied();
  return '<ul class="' + CFG.ns + '-tul">'
    + '<li><b>Фильтры</b> — в панели слева: число у значения пересчитывается сразу по выбору, выбор уходит одной кнопкой «Применить», список обновится сам.</li>'
    + '<li>В таблицу приходят первые <b>' + esc(fmtInt(ap.lim)) + '</b> сотрудников под фильтрами (можно до ' + esc(fmtInt(CFG.limits[CFG.limits.length - 1])) + ').</li>'
    + '<li>Страницы, поиск, сортировка загруженного, группировка и «Копировать» — без запроса. Новые колонки — один короткий запрос.</li>'
    + '<li>Наведите на кнопку или обрезанную ячейку — подсказка покажет, что это, или полный текст.</li></ul>';
}
function tourSteps() {
  var P = '.' + CFG.ns, out = [], V = viewRows(), pgs = V && V.idx.length ? pageSlice(V) : null;
  function add(o) { if (o.need === undefined || o.need) out.push(o); }
  add({ intro: true, title: CFG.title[MODE] + ' за минуту', html: tourIntroHTML() });
  add({ sel: '[data-tcount]', title: 'Сколько сотрудников',
    html: 'Всего под фильтрами панели слева. Если загружены не все — рядом сказано, сколько в таблице и в каком порядке они отобраны.' });
  add({ sel: '[data-tnote]', title: 'Загружены не все',
    html: 'До ' + fmtInt(CFG.limits[CFG.limits.length - 1]) + ' под фильтрами — «Загрузить всех» догрузит одним запросом. Больше — сузьте фильтры.' });
  add({ sel: '[data-scope="lim"]', lock: true, title: 'Загружать',
    html: 'Сколько первых сотрудников под фильтрами везти в таблицу: 5 000, 10 000 или 25 000. Больше строк — дольше загрузка.' });
  add({ sel: P + '-tsw', title: 'Поиск по таблице',
    html: 'Ищет по всем показанным колонкам загруженных строк и подсвечивает совпадения — сразу, без запроса.' });
  add({ sel: '[data-scope="cols"]', lock: true, title: 'Колонки',
    html: 'Группы колонок с поиском и готовые наборы. Добавить колонки — один короткий запрос, убрать — сразу.' });
  add({ sel: '[data-action="copy"]', pad: 4, lock: true, title: 'Копировать',
    html: 'Все загруженные строки (с учётом поиска) в текущем порядке строк и колонок — для вставки в Excel. Скопировалось — иконка станет галочкой.' });
  add({ sel: '[data-gzone]', title: 'Группировка',
    html: 'Перетащите сюда заголовок колонки — строки сгруппируются по её значениям, до ' + CFG.maxGroup + ' уровней. Плашки уровней можно переставлять, × или перенос обратно на заголовки снимает группировку. «+ колонка» — то же списком.' });
  add({ sel: '[data-action="gall"]', need: state.groupBy.length > 0, pad: 3, demo: true,
    done: function () { return !!state.tour && state.tour.fold0 !== allFolded(viewRows()); }, title: 'Свернуть и развернуть все',
    html: 'Общая каретка сворачивает все группы до заголовков с числом сотрудников — и разворачивает обратно. У каждой группы — своя каретка.',
    hint: 'Нажмите на каретку или «Показать».' });
  add({ sel: '[data-pager]', title: 'Страницы',
    html: 'Сколько строк на странице и листание. Все загруженные строки уже в чарте — листание мгновенное.' });
  add({ sel: '[data-action="pg"][data-key="next"]:not([disabled])', need: !!pgs && pgs.pages > 1, pad: 3, demo: true,
    done: function () { return !!state.tour && (state.page || 0) !== state.tour.page0; }, title: 'Следующая страница',
    html: 'Нажмите › — таблица покажет следующие строки.', hint: 'Нажмите на подсвеченную стрелку или «Показать».' });
  add({ sel: P + '-t thead th', all: true, pad: 2, lock: true, title: 'Заголовки колонок',
    html: '<b>Клик</b> — сортировка (все сотрудники загружены — в памяти, иначе первые под фильтрами в новом порядке). <b>Перетащить</b> — переставить колонку или сгруппировать по ней. <b>Край</b> — ширина, двойной клик — как было.' });
  add({ sel: '[data-tour="help"]', pad: 4, last: true, title: 'Тур всегда под рукой',
    html: 'Кнопка «Как работать» покажет этот тур ещё раз.' });
  return out;
}
// Карточка шага: чарт и номер, заголовок, текст, подсказка «попробуйте сами», кнопки.
function tourCardHTML(list, i, step, done) {
  var P = CFG.ns;
  var b = i > 0 ? '<button type="button" class="' + P + '-btn ' + P + '-ghost" data-tact="back">Назад</button>'
    : '<button type="button" class="' + P + '-btn ' + P + '-ghost" data-tact="close">Закрыть</button>';
  if (step.demo && !done) b += '<button type="button" class="' + P + '-btn ' + P + '-ghost" data-tact="next">Далее</button>'
    + '<button type="button" class="' + P + '-btn ' + P + '-pri" data-tact="demo">Показать</button>';
  else if (step.last) b += '<button type="button" class="' + P + '-btn ' + P + '-pri" data-tact="close">Готово</button>';
  else b += '<button type="button" class="' + P + '-btn ' + P + '-pri" data-tact="next">' + (step.intro ? 'Начать' : 'Далее') + '</button>';
  return '<span class="' + P + '-tarr"></span>'
    + '<div class="' + P + '-tch"><span class="' + P + '-tcs">' + esc(CFG.title[MODE]) + ' · ' + (i + 1) + ' из ' + list.length + '</span>'
    + '<button type="button" class="' + P + '-ib ' + P + '-tx" data-tact="close" aria-label="Закрыть тур">✕</button></div>'
    + '<div class="' + P + '-tct">' + esc(step.title) + '</div><div class="' + P + '-tcx">' + step.html + '</div>'
    + (step.demo && !done && step.hint ? '<div class="' + P + '-tchint">' + esc(step.hint) + '</div>' : '')
    + '<div class="' + P + '-tcf">' + b + '</div>';
}
function canAnim() {
  if (typeof Element === 'undefined' || !Element.prototype.animate) return false;
  return !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

// Только конкатенация строк. Все данные через esc().
// ВНИМАНИЕ: здесь префикс БЕЗ точки. var P = '.' + CFG.ns дал бы class=".pvt-root".
function buildHTML() {
  var P = CFG.ns;
  if (MODEL.err) {
    var msg = MODEL.err === 'empty' ? ['Нет данных', 'Датасет не вернул строк. Проверьте, что чарт смотрит на датасет «Детальных списков», а лимит строк — не меньше 25 000.']
      : MODEL.err === 'columns' ? ['В данных чарта нет колонок: ' + MODEL.missing.join(', '), 'Добавьте в «Измерения» чарта role, k, v, n, j (инструкция поставки, п. 4).']
      : ['Нет служебной строки meta', 'Ответ датасета неполный: увеличьте лимит строк чарта (не меньше 25 000).'];
    return buildCSS() + '<div class="' + P + '-root"><div class="' + P + '-main"><div class="' + P + '-tpan"><div class="' + P + '-empty"><b>'
      + esc(msg[0]) + '</b>' + esc(msg[1]) + '</div></div></div></div>';
  }
  var h = [];
  h.push('<div class="' + P + '-root' + (state.pend ? ' ' + P + '-busy' : '') + '">');
  h.push(headHTML());
  h.push('<div class="' + P + '-main">' + noticesHTML() + (MODEL.ok ? tableHTML() : '') + '</div>');
  h.push('</div>');
  return buildCSS() + h.join('');
}

// ---------- БЛОК 6: МОНТАЖ + ИНТЕРАКТИВ ----------
// Рассылка всем iframe борда (обход от window.top; свой пропускаем): панель фильтров той же вкладки
// узнаёт применённые фильтры (эхо этого ответа) — сама она себя не фильтрует.
function bcast(msg) {
  try {
    (function walk(w, d) {
      if (d > 5) return;
      for (var i = 0; i < w.frames.length; i++) {
        var f = w.frames[i];
        if (f !== window) { try { f.postMessage(msg, '*'); } catch (e) { /* чужой фрейм */ } }
        try { walk(f, d + 1); } catch (e2) { /* нет доступа к вложенным */ }
      }
    })(window.top, 0);
  } catch (e) { /* нет window.top — стенд без родителя */ }
}
function echoMsg() {
  var ap = applied();
  return { type: 'DL_ECHO', cf: MODEL.cf, frq: (MODEL.m && MODEL.m.frq) || '',
    f: { per: ap.per, dt: ap.dt, emp: ap.emp, tcr: ap.tcr, flt: ap.flt, mu: ap.mu, lu: ap.lu, kp: ap.kp, id: ap.id } };
}

(function mount() {
  try {
    var hosts = document.querySelectorAll('[_echarts_instance_]');
    if (!hosts || hosts.length === 0) return;
    var host = hosts[hosts.length - 1];
    var cvs = host.querySelectorAll('canvas');
    for (var i = 0; i < cvs.length; i++) cvs[i].style.display = 'none';
    var prev = host.querySelector('.' + CFG.ns + '-overlay');
    if (prev) prev.parentNode.removeChild(prev);

    var overlay = document.createElement('div');
    overlay.className = CFG.ns + '-overlay';
    overlay.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;'
      + 'z-index:10;overflow:auto;box-sizing:border-box;background:' + CFG.colors.bg + ';';
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    host.appendChild(overlay);

    // ── ТУЛТИП ──
    // Создаётся РОВНО ОДИН РАЗ и кэшируется в tipEl.
    // НИКОГДА не создавай его внутри render() и НИКОГДА не клади
    // его разметку в buildHTML(): innerHTML убьёт узел, и тултип перестанет
    // работать после первого же перерисовывания.
    var tipEl = null;
    function getTip() {
      if (tipEl && tipEl.parentNode) return tipEl;
      var old = document.querySelector('body > .' + CFG.ns + '-tip');
      if (old) old.parentNode.removeChild(old);
      tipEl = document.createElement('div');
      tipEl.className = CFG.ns + '-tip';
      document.body.appendChild(tipEl);
      return tipEl;
    }
    getTip();

    // showTip/hideTip — СЛУЖЕБНЫЕ. Не переписывать, не переименовывать, не
    // копировать их логику в свой код. Здесь заперты два правила, на которых
    // ломались все предыдущие версии:
    //   1) тултип спрятан ДВУМЯ свойствами (display + opacity) — показ обязан
    //      снять ОБА. Снял одно — узел построится и останется невидимым,
    //      без ошибок и без единого следа в отладке (RETRO 44);
    //   2) тултип лежит в body с position:fixed, поэтому координаты
    //      getBoundingClientRect() берутся КАК ЕСТЬ, а клампинг идёт по
    //      window.innerWidth/innerHeight — не по размерам контейнера (RETRO 26).
    // Твоё дело — только содержимое и якорь. Видимость и позицию считает showTip.
    function showTip(html, rect) {
      var tip = getTip();
      // За курсором showTip зовётся на каждом mousemove — HTML меняем, только если он другой.
      if (tip.__h !== html) { tip.innerHTML = html; tip.__h = html; }
      tip.style.display = 'block';
      tip.style.left = '0px';
      tip.style.top = '0px';
      var t = tip.getBoundingClientRect();
      var pad = 6, gap = 8, left, top;
      if (rect.pt) {
        // Якорь — курсор (как в Proteus Adoption): справа-снизу, у края окна — зеркально.
        left = rect.left + 14; top = rect.top + 18;
        if (left + t.width > window.innerWidth - pad) left = rect.left - t.width - 14;
        if (top + t.height > window.innerHeight - pad) top = rect.top - t.height - 14;
      } else {
        left = rect.left + rect.width / 2 - t.width / 2;
        top = rect.top + rect.height + gap;
        if (top + t.height > window.innerHeight - pad) top = rect.top - t.height - gap;
      }
      left = Math.max(pad, Math.min(left, window.innerWidth - t.width - pad));
      top = Math.max(pad, Math.min(top, window.innerHeight - t.height - pad));
      tip.style.left = Math.round(left) + 'px';
      tip.style.top = Math.round(top) + 'px';
      tip.style.opacity = '1';
    }
    function hideTip() {
      var tip = getTip();
      tip.style.opacity = '0';
      tip.style.display = 'none';
      tip.__h = null;
    }

    // Показ/скрытие тултипа НЕ требует полного render(): hover меняет только
    // содержимое и позицию, полный render() — только на клик (RETRO 20).
    // Якорь (rect) клади в state.tip при наведении: getBoundingClientRect()
    // цели КАК ЕСТЬ, без вычитания rect корня.
    function renderTip() {
      if (!state.tip) { hideTip(); return; }
      // data-tip несёт ГОТОВЫЙ html плашки (tipHtml при сборке разметки).
      showTip(state.tip.key || '', state.tip.rect);
    }

    // ── ТУР «КАК РАБОТАТЬ» (как в HRBP HUB) ──
    // Слой тура — в body, как тултип (render() его не стирает): четыре шторки вокруг цели
    // затемняют всё, кроме неё, и не пропускают клики мимо; пятая ложится на цель, если та
    // «только смотреть» (lock); рамка вокруг цели; карточка со стрелкой; курсор для показа.
    // Шаги — tourSteps() в БЛОКЕ 5; состояние — state.tour, переживает перезапуск скрипта.
    var tourNode = null;
    var CURSOR_SVG = '<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 2.5v16.2l4.3-4.1 2.9 6.6 2.6-1.1-2.9-6.5h6z" fill="#1f2530" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/></svg>';
    function tourLayer() {
      if (tourNode && tourNode.parentNode) return tourNode;
      var old = document.querySelector('body > .' + CFG.ns + '-tour');
      if (old) old.parentNode.removeChild(old);
      var P = CFG.ns, sides = ['t', 'b', 'l', 'r', 'h'], h = '';
      for (var i = 0; i < sides.length; i++) h += '<div class="' + P + '-tb" data-tb="' + sides[i] + '"></div>';
      h += '<div class="' + P + '-trings"></div><div class="' + P + '-tcard" role="dialog" aria-modal="true" aria-label="Как работать со списком"></div>'
        + '<span class="' + P + '-tclk"></span><span class="' + P + '-tcur">' + CURSOR_SVG + '</span>';
      tourNode = document.createElement('div');
      tourNode.className = P + '-tour';
      tourNode.innerHTML = h;
      document.body.appendChild(tourNode);
      // Слушатели — на новый узел, один раз: узел пересоздаётся только вместе с запуском скрипта.
      tourNode.addEventListener('click', function (e) {
        var n = e.target;
        while (n && n !== tourNode && !(n.getAttribute && n.getAttribute('data-tact'))) n = n.parentNode;
        if (n && n !== tourNode) tourAct(n.getAttribute('data-tact'));
      });
      // Колесо над затемнением листает таблицу (или сам чарт): подсветка едет вместе с целью.
      tourNode.addEventListener('wheel', function (e) {
        var tb = overlay.querySelector('[data-tbox]');
        if (tb && tb.scrollHeight > tb.clientHeight) tb.scrollTop += e.deltaY; else overlay.scrollTop += e.deltaY;
        tourPos();
      });
      return tourNode;
    }
    function tourQ(cls) { return tourNode ? tourNode.querySelector('.' + CFG.ns + '-' + cls) : null; }
    function tourEls(step) {
      if (!step || !step.sel) return [];
      var raw = typeof step.sel === 'function' ? step.sel(overlay) : overlay.querySelectorAll(step.sel), out = [];
      if (!raw) return out;
      if (raw.nodeType === 1) raw = [raw];
      for (var i = 0; i < raw.length; i++) {
        var el = raw[i], r = el && el.getBoundingClientRect ? el.getBoundingClientRect() : null;
        if (r && r.width > 0 && r.height > 0) { out.push(el); if (!step.all) break; }
      }
      return out;
    }
    function tourRect(els) {
      var l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
      for (var i = 0; i < els.length; i++) {
        var q = els[i].getBoundingClientRect();
        l = Math.min(l, q.left); t = Math.min(t, q.top); r = Math.max(r, q.right); b = Math.max(b, q.bottom);
      }
      return { left: l, top: t, right: r, bottom: b, width: r - l, height: b - t };
    }
    // Цель вне видимой части — прокручиваем overlay: цель — по центру, высокая — верхом под край.
    function tourScroll(els) {
      if (!els.length) return;
      var u = tourRect(els), o = overlay.getBoundingClientRect(), top = Math.max(o.top, 0);
      var vh = Math.min(o.bottom, window.innerHeight) - top;
      if (u.top >= top + 8 && u.bottom <= top + vh - 8) return;
      overlay.scrollTop += (u.top - top) - (u.height > vh - 160 ? 72 : (vh - u.height) / 2);
    }
    function tourBox(el, l, t, w, h) {
      el.style.left = Math.round(l) + 'px'; el.style.top = Math.round(t) + 'px';
      el.style.width = Math.max(0, Math.round(w)) + 'px'; el.style.height = Math.max(0, Math.round(h)) + 'px';
    }
    // Карточка — со стороны, где помещается (снизу, сверху, справа, слева); цель во весь экран —
    // карточка в нижнем углу поверх неё. Стрелка смотрит в центр цели.
    function tourPlace(r) {
      var card = tourQ('tcard'), arr = card ? card.querySelector('.' + CFG.ns + '-tarr') : null;
      if (!card || !arr) return;
      var W = window.innerWidth, H = window.innerHeight, m = 12, g = 14, side = '', left, top;
      var cw = card.offsetWidth, ch = card.offsetHeight;
      if (!r) { left = (W - cw) / 2; top = Math.max(m, Math.min(96, (H - ch) / 2)); }
      else {
        var cx = (r.l + r.r) / 2, cy = (r.t + r.b) / 2;
        var fits = { bottom: r.b + g + ch <= H - m, top: r.t - g - ch >= m, right: r.r + g + cw <= W - m, left: r.l - g - cw >= m };
        var order = ['bottom', 'top', 'right', 'left'];
        for (var i = 0; i < order.length && !side; i++) if (fits[order[i]]) side = order[i];
        if (side === 'bottom') { top = r.b + g; left = cx - cw / 2; }
        else if (side === 'top') { top = r.t - g - ch; left = cx - cw / 2; }
        else if (side === 'right') { left = r.r + g; top = cy - ch / 2; }
        else if (side === 'left') { left = r.l - g - cw; top = cy - ch / 2; }
        else { left = W - cw - m; top = H - ch - m; }
      }
      left = Math.max(m, Math.min(left, W - cw - m));
      top = Math.max(m, Math.min(top, H - ch - m));
      card.style.left = Math.round(left) + 'px';
      card.style.top = Math.round(top) + 'px';
      arr.className = CFG.ns + '-tarr' + (side ? ' ' + CFG.ns + '-ta-' + side : '');
      if (side === 'bottom' || side === 'top') { arr.style.left = Math.round(Math.max(14, Math.min(cw - 24, (r.l + r.r) / 2 - left - 5))) + 'px'; arr.style.top = ''; }
      else if (side) { arr.style.top = Math.round(Math.max(14, Math.min(ch - 24, (r.t + r.b) / 2 - top - 5))) + 'px'; arr.style.left = ''; }
    }
    // Только габариты: шторки, рамка, карточка — по текущему месту цели (прокрутка, ресайз, перерисовка).
    function tourPos() {
      var t = state.tour;
      if (!t || !tourNode || tourNode.style.display !== 'block') return;
      var step = tourSteps()[t.i];
      if (!step) return;
      var els = tourEls(step), W = window.innerWidth, H = window.innerHeight, r = null;
      if (els.length) {
        var u = tourRect(els), pd = step.pad === undefined ? 6 : step.pad;
        r = { l: Math.max(0, u.left - pd), t: Math.max(0, u.top - pd), r: Math.min(W, u.right + pd), b: Math.min(H, u.bottom + pd) };
        if (r.r - r.l < 4 || r.b - r.t < 4) r = null;
      }
      var Q = function (k) { return tourNode.querySelector('[data-tb="' + k + '"]'); }, rs = [];
      if (r) {
        tourBox(Q('t'), 0, 0, W, r.t);
        tourBox(Q('b'), 0, r.b, W, H - r.b);
        tourBox(Q('l'), 0, r.t, r.l, r.b - r.t);
        tourBox(Q('r'), r.r, r.t, W - r.r, r.b - r.t);
        tourBox(Q('h'), r.l, r.t, step.lock ? r.r - r.l : 0, step.lock ? r.b - r.t : 0);
        rs.push([r.l, r.t, r.r - r.l, r.b - r.t]);
      } else {
        tourBox(Q('t'), 0, 0, W, H);
        tourBox(Q('b'), 0, 0, 0, 0); tourBox(Q('l'), 0, 0, 0, 0); tourBox(Q('r'), 0, 0, 0, 0); tourBox(Q('h'), 0, 0, 0, 0);
      }
      var pool = tourQ('trings');
      while (pool.children.length < rs.length) { var nr = document.createElement('div'); nr.className = CFG.ns + '-tring'; pool.appendChild(nr); }
      for (var k = 0; k < pool.children.length; k++) {
        var rg = pool.children[k];
        rg.style.display = k < rs.length ? 'block' : 'none';
        if (k < rs.length) tourBox(rg, rs[k][0], rs[k][1], rs[k][2], rs[k][3]);
      }
      tourPlace(r);
    }
    function tourShow() {
      var t = state.tour, list = tourSteps(), step = list[t.i];
      if (!step) { tourEnd(); return; }
      var els = tourEls(step);
      // Цели нет (нет строк, одна страница, нет группировки) — шаг пропускаем в ту же сторону.
      if (step.sel && !els.length) { tourGo(t.i + (t.dir || 1), t.dir || 1); return; }
      t.shown = t.i;
      t.key = step.demo ? (els[0].getAttribute('data-key') || '') : '';
      t.fold0 = allFolded(viewRows());
      t.page0 = state.page || 0;
      t.was = step.demo ? !!step.done(t.key) : false;
      t.busy = false;
      state.tip = null;
      hideTip();
      var L = tourLayer();
      L.style.display = 'block';
      tourQ('tcur').style.display = 'none';
      tourScroll(els);
      tourQ('tcard').innerHTML = tourCardHTML(list, t.i, step, t.was);
      tourPos();
      var pb = L.querySelector('.' + CFG.ns + '-tcf .' + CFG.ns + '-pri');
      if (pb && pb.focus) pb.focus();
    }
    function tourGo(i, dir) {
      var t = state.tour;
      if (!t) return;
      if (i >= tourSteps().length) { tourEnd(); return; }
      if (i < 0) { i = 0; dir = 1; }
      t.i = i; t.dir = dir; t.shown = -1;
      tourShow();
    }
    function tourStart() {
      state.open = ''; state.q = ''; state.colDraft = null; state.tip = null;
      hideTip();
      state.tour = { i: 0, dir: 1, shown: -1, key: '', was: false, busy: false, fold0: false };
      overlay.scrollTop = 0;
      render();
    }
    function tourEnd() {
      state.tour = null;
      if (tourNode) tourNode.style.display = 'none';
    }
    // После каждой перерисовки: шаг «нажми — будет» сделан (пользователем или показом) — следующий
    // шаг; иначе подсветка — по новому месту цели. Доступа нет — тур окончен.
    function tourSync() {
      var t = state.tour;
      if (!t) {
        if (tourNode) tourNode.style.display = 'none';
        else { var old = document.querySelector('body > .' + CFG.ns + '-tour'); if (old) old.parentNode.removeChild(old); }
        return;
      }
      if (MODEL.err || !MODEL.ok) { tourEnd(); return; }
      if (!tourNode || !tourNode.parentNode || t.shown !== t.i) { tourShow(); return; }
      var step = tourSteps()[t.i];
      if (step && step.demo && !t.was && !t.busy && step.done(t.key)) { tourGo(t.i + 1, 1); return; }
      tourPos();
    }
    // Показ «нажми — будет»: курсор едет от кнопки к цели, «нажимает» — и клик идёт по-настоящему,
    // тем же обработчиком, что и клик мышью. Без анимации (prefers-reduced-motion) — сразу клик.
    function tourDemo() {
      var t = state.tour;
      if (!t || t.busy) return;
      var step = tourSteps()[t.i], els = tourEls(step);
      if (!els.length) return;
      var r = els[0].getBoundingClientRect(), cur = tourQ('tcur'), clk = tourQ('tclk');
      var x = r.left + r.width / 2, y = r.top + r.height / 2;
      var fire = function () {
        if (state.tour !== t) { cur.style.display = 'none'; return; }
        t.busy = false;
        var now = tourEls(step);
        if (now.length && !step.done(t.key)) onClick({ target: now[0] });
        else tourSync();
      };
      if (!canAnim()) { fire(); return; }
      t.busy = true;
      var btn = tourNode.querySelector('[data-tact="demo"]'), br = btn ? btn.getBoundingClientRect() : { left: x, top: y + 90, width: 0, height: 0 };
      cur.style.transition = 'none';
      cur.style.left = Math.round(br.left + br.width / 2) + 'px';
      cur.style.top = Math.round(br.top + br.height / 2) + 'px';
      cur.style.display = 'block';
      cur.getBoundingClientRect();
      cur.style.transition = '';
      cur.style.left = Math.round(x - 5) + 'px';
      cur.style.top = Math.round(y - 2.5) + 'px';
      setTimeout(function () {
        clk.style.left = Math.round(x) + 'px';
        clk.style.top = Math.round(y) + 'px';
        clk.animate([{ opacity: 0.9, transform: 'scale(.35)' }, { opacity: 0, transform: 'scale(1.5)' }], { duration: 450, easing: 'ease-out' });
        cur.animate([{ transform: 'scale(1)' }, { transform: 'scale(.82)' }, { transform: 'scale(1)' }], { duration: 240 });
        setTimeout(function () { fire(); setTimeout(function () { cur.style.display = 'none'; }, 420); }, 200);
      }, 700);
    }
    function tourAct(a) {
      if (a === 'tour') { tourStart(); return; }
      if (!state.tour) return;
      if (a === 'next') tourGo(state.tour.i + 1, 1);
      else if (a === 'back') tourGo(state.tour.i - 1, -1);
      else if (a === 'demo') tourDemo();
      else if (a === 'close') tourEnd();
    }

    // render ТОЛЬКО пересобирает разметку. Делегированные обработчики
    // навешиваются ОДИН РАЗ СНАРУЖИ render(): overlay не пересоздаётся.
    // Любой addEventListener внутри render() ЗАПРЕЩЁН — он создаёт дубли.
    // Прокрутку таблицы, списка поповера и самого overlay храним.
    function scrollOf() {
      var tb = overlay.querySelector('[data-tbox]'), pl = overlay.querySelector('[data-plist]');
      return { ov: overlay.scrollTop, tt: tb ? tb.scrollTop : 0, tl: tb ? tb.scrollLeft : 0, pl: pl ? pl.scrollTop : 0, pk: state.open };
    }
    function scrollTo(k, withTable) {
      if (!k) return;
      overlay.scrollTop = k.ov;
      var tb = overlay.querySelector('[data-tbox]'), pl = overlay.querySelector('[data-plist]');
      if (tb && withTable) { tb.scrollTop = k.tt; tb.scrollLeft = k.tl; }
      if (pl && k.pk === state.open) pl.scrollTop = k.pl;
      placePop();
    }
    // Поповер не вылезает за край ячейки: сдвиг внутрь и ширина не больше ячейки.
    function placePop() {
      var pop = overlay.querySelector('.' + CFG.ns + '-pop');
      if (!pop) return;
      var o = overlay.getBoundingClientRect();
      if (pop.offsetWidth > o.width - 16) pop.style.width = Math.max(260, o.width - 16) + 'px';
      var r = pop.getBoundingClientRect();
      if (r.right > o.right - 8) pop.style.left = Math.round(pop.offsetLeft - (r.right - (o.right - 8))) + 'px';
      r = pop.getBoundingClientRect();
      if (r.left < o.left + 8) pop.style.left = Math.round(pop.offsetLeft + (o.left + 8 - r.left)) + 'px';
    }
    function render() {
      var k = scrollOf(), had = overlay.contains(document.activeElement);
      overlay.innerHTML = buildHTML();
      scrollTo(k, true);
      // Фокус был в виджете (чекбокс в поповере) и пропал с пересборкой — в поповер: Esc и клавиши работают.
      if (had && state.open && !overlay.contains(document.activeElement)) {
        var pop = overlay.querySelector('.' + CFG.ns + '-pop');
        if (pop) { try { pop.focus({ preventScroll: true }); } catch (er) { pop.focus(); } }
      }
      renderTip();
      tourSync();
    }
    // Только таблица, страницы и итог — поле поиска по таблице не пересоздаётся (фокус остаётся).
    function refreshTable() {
      var box = overlay.querySelector('[data-tbox]');
      if (!box) { render(); return; }
      var V = viewRows();
      box.innerHTML = tableInnerHTML(V);
      var pg = overlay.querySelector('[data-pager]');
      if (pg) pg.innerHTML = pagerHTML(V);
      var tc = overlay.querySelector('[data-tcount]');
      if (tc) tc.innerHTML = countHTML(V);
      // Зона группировки (общая каретка) и «Копировать» (нечего копировать — выключена); открытый поповер не трогаем.
      var gz = overlay.querySelector('[data-gzone]');
      if (gz && !state.open) gz.innerHTML = gzoneInner(V);
      var cb = overlay.querySelector('[data-action="copy"]');
      if (cb) cb.outerHTML = copyBtnHTML(V);
      tourSync();
    }
    // Список открытого поповера «Колонки» — без поля поиска над ним (каретка живёт, RETRO 68).
    function refreshList() {
      var box = overlay.querySelector('[data-plist]');
      if (box && state.open === 'cols') box.innerHTML = colGridHTML();
    }
    function focusTable() {
      var ts = overlay.querySelector('[data-tsearch]');
      if (!ts) return;
      ts.focus();
      try { ts.setSelectionRange(ts.value.length, ts.value.length); } catch (er) { /* поле без выделения */ }
    }
    function focusPop() {
      var inp = overlay.querySelector('[data-psearch]');
      if (inp) {
        inp.focus();
        try { inp.setSelectionRange(inp.value.length, inp.value.length); } catch (er) { /* поле без выделения */ }
        return;
      }
      var pop = overlay.querySelector('.' + CFG.ns + '-pop');
      if (pop && pop.focus) pop.focus();
    }

    // Имена атрибутов — ЧАСТЬ КОНТРАКТА, а не стиль: `data-tip`, `data-kind`,
    // `data-action`, `data-view` — ровно эти, ЦЕЛИКОМ. По ним smoke.mjs ищет,
    // что наводить и на что кликать. Своё имя (`data-tip-kind`) он не найдёт,
    // а склейка с префиксом (`CFG.ns + '-data-tip'`) в DOM даёт `pvt-data-tip`:
    // виджет при этом работает — свой же обработчик читает то же имя, — но
    // ВЕСЬ тултиповый слой уходит в N/A, и экрана не видит никто (RETRO 56, 59).
    // Префикс CFG.ns нужен КЛАССАМ, data-атрибутам — нет.
    function trigger(node, attr) {
      while (node && node !== overlay) {
        if (node.getAttribute && node.getAttribute(attr) !== null) return node;
        node = node.parentNode;
      }
      return null;
    }

    // ── НАВЕДЕНИЕ: тултип едет за курсором и не мигает ──
    // Цель — ближайший [data-tip] или ячейка таблицы, где текст не влез (подсказка — полный текст).
    // Между соседними целями тултип не гаснет; ушёл в пустоту — гаснет через TIP_HIDE мс.
    var TIP_HIDE = 110, tipHideT = null;
    function curPt(e) { return { left: e.clientX, top: e.clientY, width: 0, height: 0, pt: true }; }
    function cancelHide() { if (tipHideT) { clearTimeout(tipHideT); tipHideT = null; } }
    function dropTip() { cancelHide(); state.tip = null; hideTip(); }
    function scheduleHide() {
      if (tipHideT || !state.tip) return;
      tipHideT = setTimeout(function () { tipHideT = null; state.tip = null; hideTip(); }, TIP_HIDE);
    }
    function cellOf(node) {
      while (node && node !== overlay) {
        if (node.tagName === 'TD') return node;
        if (node.tagName === 'TABLE') return null;
        node = node.parentNode;
      }
      return null;
    }
    function onMove(e) {
      if (state.drag || state.resizing) return;
      var el = trigger(e.target, 'data-tip');
      // Кнопка с раскрытым поповером подсказку не показывает: меню и так перед глазами.
      if (el && el.getAttribute('aria-haspopup') && el.getAttribute('aria-expanded') === 'true') el = null;
      var html = el ? el.getAttribute('data-tip') || '' : '';
      if (!html) {
        var td = cellOf(e.target);
        if (td && td.scrollWidth > td.clientWidth + 1 && trim(td.textContent)) html = '<span class="' + CFG.ns + '-t-x">' + esc(td.textContent) + '</span>';
      }
      if (!html) { scheduleHide(); return; }
      cancelHide();
      state.tip = { rect: curPt(e), key: html, kind: el ? el.getAttribute('data-kind') || '' : 'cell' };
      showTip(html, state.tip.rect);
    }
    function onLeave() { dropTip(); }

    // ── ЭМИССИЯ КРОСС-ФИЛЬТРА ──
    // Список фильтрует САМ СЕБЯ (самовлияние включено в дашборде): колонки, сортировка, лимит. Каждый эмит
    // несёт метку rq; ответ с той же меткой в эхе снимает «ожидание». Фильтры шлёт панель фильтров — о них
    // список узнаёт сообщением DL_FLT и ждёт ответ с той же меткой frq. Метки нет CFG.pendingWarnMs — говорим.
    function armPend() {
      if (state.pendT) clearTimeout(state.pendT);
      state.pendT = null;
      if (!state.pend) return;
      var left = Math.max(200, CFG.pendingWarnMs - (Date.now() - state.pend.at));
      state.pendT = setTimeout(function () {
        state.pendT = null;
        if (!state.pend) return;
        state.pend = null;
        state.warn = CFG.text.notApplied;
        if (state.rerender) state.rerender();
      }, left);
    }
    function emit(view, o) {
      o = o || {};
      if (!o.keepPop) { state.open = ''; state.q = ''; }
      if (typeof applyCrossFilter !== 'function') { state.warn = CFG.text.noCf; render(); if (o.keepPop) focusPop(); return; }
      state.warn = '';
      state.rqN = (state.rqN || 0) + 1;
      var next = { cols: view.cols, sort: view.sort, lim: view.lim, rq: 'q' + state.rqN + '.' + (Date.now() % 1000000) };
      state.keep = scrollOf();
      state.pend = { rq: next.rq, at: Date.now(), kind: 'rows' };
      state.tip = null;
      hideTip();
      armPend();
      render();
      if (o.keepPop) focusPop();
      applyCrossFilter(maskOf(next));
    }

    // ── СТРОКИ ТАБЛИЦЫ: «Копировать» — все найденные, в текущем порядке строк и колонок ──
    function copyRows() {
      var V = viewRows();
      if (!V || !ROWS) return;
      var cols = state.groupBy.concat(V.cols), perRow = false, lines = [], head = [];
      for (var c = 0; c < cols.length; c++) { head.push(labelOf(cols[c])); if (isAllocKey(cols[c]) && !isVirtual(cols[c])) perRow = true; }
      lines.push(head.join('\t'));
      var order = V.idx, bl = ROWS.blocks, nb = 0;
      if (V.items) { order = []; var all = viewAllItems(V); for (var it = 0; it < all.length; it++) order.push(all[it]); }
      for (var i = 0; i < order.length; i++) {
        var b = bl[order[i]], last = perRow ? b.i + b.n : b.i + 1;
        nb++;
        for (var r = b.i; r < last; r++) {
          var line = [];
          for (var k = 0; k < cols.length; k++) {
            var key = cols[k], v = isVirtual(key) ? blockVal(b, key) : cellRaw(ROWS.rows[isAllocKey(key) ? r : b.i], key);
            line.push(copyText(key, v).replace(/[\t\r\n]+/g, ' '));
          }
          lines.push(line.join('\t'));
        }
      }
      // Итог — иконкой (галочка) и в подсказке кнопки; кнопка не меняет ширину и место.
      var text = lines.join('\n'), swap = function () {
        var b = overlay.querySelector('[data-action="copy"]');
        if (!b) return;
        b.outerHTML = copyBtnHTML(viewRows());
        var nb2 = overlay.querySelector('[data-action="copy"]');
        if (state.tip && state.tip.kind !== 'cell' && nb2) { state.tip.key = nb2.getAttribute('data-tip') || ''; renderTip(); }
      }, done = function (ok) {
        state.copied = ok ? 'Скопировано: ' + fmtInt(nb) + ' ' + plural(nb, 'сотрудник', 'сотрудника', 'сотрудников') : 'Не скопировалось';
        swap();
        if (state.copyT) clearTimeout(state.copyT);
        state.copyT = setTimeout(function () { state.copyT = null; state.copied = ''; swap(); }, 2200);
      };
      var fallback = function () {
        var ta = document.createElement('textarea'), ok = false;
        ta.value = text;
        ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;';
        overlay.appendChild(ta);
        ta.select();
        try { ok = document.execCommand('copy'); } catch (er) { ok = false; }
        overlay.removeChild(ta);
        done(ok);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { done(true); }, fallback);
      else fallback();
    }
    // При группировке «Копировать» идёт в порядке групп, свёрнутые группы тоже попадают.
    function viewAllItems(V) {
      var saved = state.collapsedGroups, out = [];
      state.collapsedGroups = {};
      var W = viewRows();
      state.collapsedGroups = saved;
      for (var i = 0; i < W.items.length; i++) if (!W.items[i].g) out.push(W.items[i].b);
      return out;
    }

    // Группировка — только вид: снять колонку (to — поставить её перед этой колонкой таблицы) или добавить.
    function ungroup(k, to) {
      var gl = state.groupBy.slice(), gi = gl.indexOf(k);
      if (gi < 0) return;
      gl.splice(gi, 1);
      state.groupBy = gl;
      if (to && to !== k && !inArr(LOCKED, to)) {
        var o = colOrder(), fi = o.indexOf(k);
        if (fi > -1) o.splice(fi, 1);
        o.splice(Math.max(0, o.indexOf(to)), 0, k);
        state.columnOrder = o;
      }
      state.collapsedGroups = {};
      state.page = 0;
      render();
    }
    function groupAdd(k, before) {
      if (!canGroup(k)) return;
      var gl = state.groupBy.slice(), at = before ? gl.indexOf(before) : -1;
      if (at > -1) gl.splice(at, 0, k); else gl.push(k);
      state.groupBy = gl;
      state.collapsedGroups = {};
      state.page = 0;
      render();
    }
    function onClick(e) {
      if (state.noClick && Date.now() - state.noClick < 250) return;
      // Тур «Как работать»: кнопка в шапке.
      var ta = trigger(e.target, 'data-tact');
      if (ta) { tourAct(ta.getAttribute('data-tact')); return; }
      // Клик мимо открытого поповера закрывает его; data-scope — на обёртке
      // открывателя вместе с поповером: клик по списку/поиску — «внутри».
      var sc = trigger(e.target, 'data-scope');
      if (state.open && (!sc || sc.getAttribute('data-scope') !== state.open)) {
        state.open = '';
        state.q = '';
        state.colDraft = null;
        if (!trigger(e.target, 'data-action')) {
          // Клик мимо поповера в поиск по таблице: после пересборки курсор — в новом поле.
          var inTs = e.target && e.target.getAttribute && e.target.getAttribute('data-tsearch') !== null;
          render();
          if (inTs) focusTable();
          return;
        }
      }
      var a = trigger(e.target, 'data-action');
      if (!a) return;
      var act = a.getAttribute('data-action'), key = a.getAttribute('data-key') || '';
      if (act === 'open') {
        var pop = a.getAttribute('data-pop') || '';
        if (state.open === pop) { state.open = ''; state.q = ''; state.colDraft = null; render(); return; }
        state.open = pop;
        state.q = '';
        if (pop === 'cols') { state.colDraft = colOrder().slice(); state.colQ = ''; }
        state.tip = null;
        hideTip();
        render();
        focusPop();
        return;
      }
      // Колонки: черновик в поповере; «Показать» — без запроса, если всё уже загружено.
      if (act === 'preset') {
        var pr = CFG.presets[+key];
        if (pr) state.colDraft = presetCols(pr);
        render();
        return;
      }
      if (act === 'colreset') { state.colDraft = LOCKED.concat(CFG.defaultCols); state.colDraft = uniq(state.colDraft); render(); return; }
      if (act === 'colapply') {
        var draft = uniq(state.colDraft || colOrder()), miss = false;
        for (var d = 0; d < draft.length; d++) if (!loaded(draft[d])) miss = true;
        state.columnOrder = draft;
        state.open = ''; state.q = ''; state.colDraft = null;
        if (state.sortKey && !inArr(draft, state.sortKey) && !inArr(state.groupBy, state.sortKey)) { state.sortKey = ''; state.sortDir = ''; }
        if (!miss) { render(); return; }
        var ap = applied();
        emit({ cols: reqCols(draft), sort: ap.sort, lim: ap.lim }, { kind: 'rows' });
        return;
      }
      if (act === 'setlim') {
        var ap2 = applied(), lim = +key;
        state.open = '';
        if (lim === ap2.lim) { render(); return; }
        state.page = 0;
        emit({ cols: reqCols(), sort: ap2.sort, lim: lim }, { kind: 'rows' });
        return;
      }
      // Сортировка: все сотрудники загружены — в памяти; иначе — на сервере (первые N в новом порядке).
      // Колонки аллокаций сервер не сортирует — они всегда в памяти.
      if (act === 'sort') {
        if (!ROWS) return;
        var sn = sortNow(), dir = sn.key !== key ? 'asc' : (sn.dir === 'asc' ? 'desc' : '');
        state.page = 0;
        if (ROWS.blocks.length >= MODEL.total || isAllocKey(key)) {
          state.sortKey = dir ? key : '';
          state.sortDir = dir;
          refreshTable();
          return;
        }
        state.sortKey = ''; state.sortDir = '';
        var ap3 = applied();
        emit({ cols: reqCols(), sort: dir ? key + ':' + dir : 'master_id:asc', lim: ap3.lim }, { kind: 'rows' });
        return;
      }
      if (act === 'grp') { state.collapsedGroups[key] = !state.collapsedGroups[key]; refreshTable(); return; }
      // Общая каретка: все свёрнуты — развернуть все, иначе свернуть все уровни.
      if (act === 'gall') {
        var Vg = viewRows(), fold = allFolded(Vg);
        state.collapsedGroups = {};
        if (!fold) for (var g = 0; Vg && g < Vg.gkeys.length; g++) state.collapsedGroups[Vg.gkeys[g]] = true;
        state.page = 0;
        refreshTable();
        // Подсказка каретки — уже про обратное действие.
        var gb = overlay.querySelector('[data-action="gall"]');
        if (state.tip && gb) { state.tip.key = gb.getAttribute('data-tip') || ''; renderTip(); }
        return;
      }
      if (act === 'gdel') { ungroup(key, ''); return; }
      if (act === 'ps') { state.pageSize = +key || 100; state.page = 0; refreshTable(); return; }
      if (act === 'pg') {
        var Vp = viewRows(), pgs = Vp ? pageSlice(Vp) : null;
        if (!pgs) return;
        state.page = key === 'first' ? 0 : (key === 'last' ? pgs.pages - 1 : pgs.pg + (key === 'next' ? 1 : -1));
        refreshTable();
        var tb = overlay.querySelector('[data-tbox]');
        if (tb) tb.scrollTop = 0;
        return;
      }
      if (act === 'copy') { copyRows(); return; }
    }

    // Чекбоксы: change, не click (label/input дают оба события).
    function onChange(e) {
      var t = e.target;
      if (!t || !t.getAttribute) return;
      var ck = t.getAttribute('data-colk');
      if (ck) {
        var dr = (state.colDraft || colOrder()).slice(), ai = dr.indexOf(ck);
        if (t.checked && ai < 0) dr.push(ck);
        if (!t.checked && ai > -1 && !inArr(LOCKED, ck)) dr.splice(ai, 1);
        state.colDraft = dr;
        render();
        return;
      }
      var cg = t.getAttribute('data-colg');
      if (cg !== null) {
        var gs = colGroups(lower(trim(state.colQ))), dr2 = (state.colDraft || colOrder()).slice();
        for (var g = 0; g < gs.length; g++) {
          if (gs[g].name !== cg) continue;
          for (var i = 0; i < gs[g].items.length; i++) {
            var kk = gs[g].items[i].key, at2 = dr2.indexOf(kk);
            if (t.checked && at2 < 0) dr2.push(kk);
            if (!t.checked && at2 > -1 && !inArr(LOCKED, kk)) dr2.splice(at2, 1);
          }
        }
        state.colDraft = dr2;
        render();
        return;
      }
      var gk = t.getAttribute('data-grp');
      if (gk) {
        var gl = state.groupBy.slice(), gi = gl.indexOf(gk);
        if (t.checked && gi < 0 && gl.length < CFG.maxGroup) gl.push(gk);
        if (!t.checked && gi > -1) gl.splice(gi, 1);
        state.groupBy = gl;
        state.collapsedGroups = {};
        state.page = 0;
        // Колонка группировки уходит в заголовки групп; если её нет в строках — одним запросом.
        if (t.checked && !loaded(gk)) {
          var ap = applied();
          emit({ cols: reqCols(), sort: ap.sort, lim: ap.lim }, { kind: 'rows', keepPop: true });
          return;
        }
        render();
        return;
      }
    }

    // Поиск в поповере и по таблице: пересобираем ТОЛЬКО список / таблицу — поле ввода
    // не трогаем, фокус и каретка остаются на месте (E23b).
    var tsT = null;
    function onInput(e) {
      var t = e.target;
      if (!t || !t.getAttribute) return;
      var ps = t.getAttribute('data-psearch');
      if (ps !== null) { state.colQ = t.value; refreshList(); return; }
      if (t.getAttribute('data-tsearch') !== null) {
        state.search = t.value;
        state.page = 0;
        if (tsT) clearTimeout(tsT);
        tsT = setTimeout(function () { tsT = null; refreshTable(); }, 120);
        return;
      }
    }

    // Escape закрывает открытый поповер (smoke E24).
    function onKeydown(e) {
      var k = e.keyCode || e.which, t = e.target;
      if (k === 27 && t && t.getAttribute && t.getAttribute('data-tsearch') !== null && state.search) {
        t.value = ''; state.search = ''; state.page = 0; refreshTable(); return;
      }
      if (k === 27 && state.open) { state.open = ''; state.q = ''; state.colDraft = null; render(); return; }
      // Не-кнопки с role="button" («×» у фильтра): Enter/пробел = клик.
      if ((k === 13 || k === 32) && t && t.getAttribute && t.getAttribute('role') === 'button' && t.tagName !== 'BUTTON') {
        e.preventDefault();
        onClick({ target: t });
      }
    }

    // ── КОЛОНКИ: перетащить заголовок — порядок или группировка, край заголовка — ширина ──
    // Заголовок → на заголовок: порядок колонок; → в зону группировки: сгруппировать.
    // Плашка группировки → на плашку: порядок уровней; → на заголовки: снять группировку.
    function onDragStart(e) {
      if (state.resizing) { e.preventDefault(); return; }
      var th = trigger(e.target, 'data-col'), ch = th ? null : trigger(e.target, 'data-gcol');
      var k = th ? th.getAttribute('data-col') : (ch ? ch.getAttribute('data-gcol') : '');
      if (!k) return;
      if (th && inArr(LOCKED, k) && !canGroup(k)) { e.preventDefault(); return; }
      state.drag = k;
      state.dragFrom = th ? 'th' : 'gz';
      (th || ch).classList.add(CFG.ns + '-dragsrc');
      if (e.dataTransfer) { e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', k); } catch (er) { /* IE */ } }
      dropTip();
    }
    function markOver(el, zone) {
      var old = overlay.querySelectorAll('.' + CFG.ns + '-dragover');
      for (var i = 0; i < old.length; i++) if (old[i] !== el) old[i].classList.remove(CFG.ns + '-dragover');
      if (el) el.classList.add(CFG.ns + '-dragover');
      var gz = overlay.querySelector('[data-gzone]');
      if (gz) gz.classList[zone ? 'add' : 'remove'](CFG.ns + '-gzon');
    }
    // Куда можно бросить: {zone, el, to} или null.
    function dropAt(target) {
      var k = state.drag, from = state.dragFrom;
      if (!k) return null;
      if (trigger(target, 'data-gzone')) {
        var ch = trigger(target, 'data-gcol'), to = ch ? ch.getAttribute('data-gcol') : '';
        if (from === 'gz') return { zone: true, el: ch && to !== k ? ch : null, to: to };
        return canGroup(k) ? { zone: true, el: ch, to: to } : null;
      }
      var th = trigger(target, 'data-col'), tk = th ? th.getAttribute('data-col') : '';
      if (!th) return null;
      if (from === 'gz') return { el: th, to: tk };
      if (inArr(LOCKED, k) || inArr(LOCKED, tk)) return null;
      return { el: th, to: tk };
    }
    function onDragOver(e) {
      var d = dropAt(e.target);
      if (!d) { markOver(null, false); return; }
      e.preventDefault();
      markOver(d.el, d.zone);
    }
    function onDrop(e) {
      if (!state.drag) return;
      e.preventDefault();
      var d = dropAt(e.target), from = state.drag, src = state.dragFrom;
      state.drag = ''; state.dragFrom = '';
      markOver(null, false);
      state.noClick = Date.now();
      if (!d) { refreshTable(); return; }
      if (d.zone && src === 'gz') {
        if (!d.to || d.to === from) return;
        var gl = state.groupBy.slice();
        gl.splice(gl.indexOf(from), 1);
        gl.splice(gl.indexOf(d.to), 0, from);
        state.groupBy = gl;
        state.collapsedGroups = {};
        state.page = 0;
        render();
        return;
      }
      if (d.zone) { groupAdd(from, d.to); return; }
      if (src === 'gz') { ungroup(from, d.to); return; }
      if (!d.to || d.to === from) { refreshTable(); return; }
      var o = colOrder(), fi = o.indexOf(from);
      if (fi > -1) o.splice(fi, 1);
      o.splice(o.indexOf(d.to), 0, from);
      state.columnOrder = o;
      refreshTable();
    }
    function onDragEnd() {
      state.drag = ''; state.dragFrom = '';
      markOver(null, false);
      var s = overlay.querySelector('.' + CFG.ns + '-dragsrc');
      if (s) s.classList.remove(CFG.ns + '-dragsrc');
    }
    function onDown(e) {
      var t = e.target, key = t && t.getAttribute ? t.getAttribute('data-rsz') : null;
      if (!key) return;
      e.preventDefault();
      e.stopPropagation();
      var cols = displayCols(), idx = cols.indexOf(key), th = t.parentNode, table = th.parentNode;
      while (table && table.tagName !== 'TABLE') table = table.parentNode;
      var colEl = table ? table.querySelectorAll('col')[idx] : null, x0 = e.clientX, w0 = th.offsetWidth;
      state.resizing = true;
      dropTip();
      var move = function (ev) {
        var w = Math.max(CFG.spacing.colMin, Math.min(CFG.spacing.colMax, Math.round(w0 + ev.clientX - x0)));
        state.colW[key] = w;
        if (colEl) colEl.style.width = w + 'px';
        if (table) { var W = 0; for (var i = 0; i < cols.length; i++) W += colW(cols[i]); table.style.width = W + 'px'; }
      };
      var up = function () {
        document.removeEventListener('mousemove', move, true);
        document.removeEventListener('mouseup', up, true);
        state.resizing = false;
        state.noClick = Date.now();
      };
      document.addEventListener('mousemove', move, true);
      document.addEventListener('mouseup', up, true);
    }
    // Двойной клик по краю заголовка — ширина по умолчанию.
    function onDbl(e) {
      var key = e.target && e.target.getAttribute ? e.target.getAttribute('data-rsz') : null;
      if (!key) return;
      delete state.colW[key];
      refreshTable();
    }

    overlay.addEventListener('mousemove', onMove);
    overlay.addEventListener('mouseleave', onLeave);
    overlay.addEventListener('mousedown', onDown);
    overlay.addEventListener('dblclick', onDbl);
    overlay.addEventListener('click', onClick);
    overlay.addEventListener('change', onChange);
    overlay.addEventListener('input', onInput);
    overlay.addEventListener('keydown', onKeydown);
    overlay.addEventListener('dragstart', onDragStart);
    overlay.addEventListener('dragover', onDragOver);
    overlay.addEventListener('drop', onDrop);
    overlay.addEventListener('dragend', onDragEnd);
    // Полка прокрутилась — поповер её фильтра едет следом (scroll не всплывает: перехват).
    // Прокрутка чарта или таблицы во время тура — подсветка едет за целью (scroll не всплывает: перехват).
    overlay.addEventListener('scroll', function () { if (state.tour) tourPos(); }, true);

    // Глобальные слушатели переживают перезапуск скрипта и накапливаются.
    // Старый снимаем ЯВНО, ссылку держим в state. Escape вешай здесь же,
    // тем же способом, и никогда не внутри render().
    if (state.onWinResize) window.removeEventListener('resize', state.onWinResize);
    state.onWinResize = function () { if (state.tip) renderTip(); if (state.tour) tourPos(); };
    window.addEventListener('resize', state.onWinResize);
    // Клик мимо виджета (по дашборду) закрывает поповер.
    if (state.onDocDown) document.removeEventListener('mousedown', state.onDocDown, true);
    state.onDocDown = function (ev) {
      if (!state.open || !overlay.parentNode) return;
      var n = ev.target;
      while (n) { if (n === overlay) return; n = n.parentNode; }
      state.open = '';
      state.q = '';
      state.colDraft = null;
      render();
    };
    document.addEventListener('mousedown', state.onDocDown, true);
    // Esc закрывает поповер, даже если фокус ушёл из виджета (клик по полю дашборда и т. п.).
    if (state.onDocKey) document.removeEventListener('keydown', state.onDocKey, true);
    state.onDocKey = function (ev) {
      if ((ev.keyCode || ev.which) !== 27 || !state.open || !overlay.parentNode || overlay.contains(ev.target)) return;
      state.open = '';
      state.q = '';
      state.colDraft = null;
      render();
    };
    document.addEventListener('keydown', state.onDocKey, true);
    // Клавиши тура — на документе (фокус в карточке тура, она вне overlay): Esc закрывает,
    // стрелки листают. Старый слушатель снимаем — он держит прошлый запуск скрипта.
    if (state.onTourKey) document.removeEventListener('keydown', state.onTourKey, true);
    state.onTourKey = function (ev) {
      if (!state.tour) return;
      var k = ev.keyCode || ev.which, tag = ev.target && ev.target.tagName;
      if (k === 27) { ev.preventDefault(); ev.stopPropagation(); tourEnd(); return; }
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if (k === 39) { ev.preventDefault(); tourAct('next'); }
      else if (k === 37) { ev.preventDefault(); tourAct('back'); }
    };
    document.addEventListener('keydown', state.onTourKey, true);
    state.rerender = render;
    // «Применить» в панели фильтров той же вкладки (тот же cf): ждём ответ с её меткой frq.
    if (state.onFlt) window.removeEventListener('message', state.onFlt);
    state.onFlt = function (ev) {
      var d = ev.data || {};
      if (d.type === 'DL_ASK' && d.cf === MODEL.cf && MODEL.m && MODEL.ok && overlay.parentNode) { bcast(echoMsg()); return; }
      if (d.type !== 'DL_FLT' || d.cf !== MODEL.cf || !d.frq || !overlay.parentNode) return;
      if (MODEL.m && MODEL.m.frq === d.frq) return;
      state.pend = { frq: String(d.frq), at: Date.now(), kind: 'filters' };
      state.page = 0;
      state.warn = '';
      armPend();
      render();
    };
    window.addEventListener('message', state.onFlt);

    // Ответ пришёл: метка совпала с ожиданием — снимаем его (свой запрос — rq, фильтры — frq).
    var m0 = MODEL.m || {}, kept = state.keep;
    if (state.pend && ((state.pend.rq && m0.rq === state.pend.rq) || (state.pend.frq && m0.frq === state.pend.frq))) {
      state.pend = null;
      state.keep = null;
      if (state.warn === CFG.text.notApplied) state.warn = '';
    } else if (state.pend && Date.now() - state.pend.at > CFG.pendingWarnMs) {
      state.pend = null;
      state.warn = CFG.text.notApplied;
    }
    armPend();

    render();
    // Панели фильтров — что применено (она сама себя не фильтрует).
    if (MODEL.m && MODEL.ok) bcast(echoMsg());
    // Новые строки — сверху; прокрутка страницы — как была.
    if (kept && !state.pend) scrollTo(kept, false);
    if (state.open) focusPop();

    // ResizeObserver только правит габариты. НЕ вызывать render() — зациклит.
    // Старый observer отключаем: иначе он держит удалённый overlay.
    if (typeof ResizeObserver !== 'undefined') {
      if (state.ro && state.ro.disconnect) state.ro.disconnect();
      var ro = new ResizeObserver(function() {
        overlay.style.width = '100%'; overlay.style.height = '100%';
        if (state.open) placePop();
        if (state.tour) tourPos();
      });
      ro.observe(host);
      state.ro = ro;
    }
  } catch (e) {
    // option присваивается позже, в БЛОКЕ 7: из catch к нему не обращаться.
    // Ищем overlay внутри СВОЕГО хоста: на дашборде может быть второй виджет
    // с тем же ns, и сообщение об ошибке уедет не туда.
    var box = null;
    var hs = document.querySelectorAll('[_echarts_instance_]');
    if (hs && hs.length) box = hs[hs.length - 1].querySelector('.' + CFG.ns + '-overlay');
    if (!box) box = document.querySelector('.' + CFG.ns + '-overlay');
    if (box) {
      box.innerHTML = '<div style="padding:16px;font:13px -apple-system,Arial,sans-serif;color:#b00020;">'
        + 'Ошибка графика: ' + esc((e && e.message) || e) + '</div>';
    }
  }
})();

// ---------- БЛОК 7: ПУСТОЙ OPTION ----------
// ГЛОБАЛЬНО, В САМОМ КОНЦЕ, ВНЕ функций и IIFE.
// После этого присваивания option не трогать: любая мутация вернёт eCharts
// к отрисовке своего графика поверх overlay.
option = {
  animation: false,
  xAxis: { show: false, type: 'value' },
  yAxis: { show: false, type: 'value' },
  series: [{ type: 'scatter', data: [] }]
};
