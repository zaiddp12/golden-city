"""Conservative, provenance-preserving import of Golden City XLSX workbooks.

Python standard library only. Never executes formulas, macros, external links or
embedded code. A worksheet observation is not an authority to clear a live booking.
The HTTP application performs that separate authorization/reconciliation step.
"""
from __future__ import annotations

from collections import Counter, defaultdict
from datetime import date, datetime, timedelta, timezone
import hashlib
import json
import math
from pathlib import Path, PurePosixPath
import re
import zipfile
import xml.etree.ElementTree as ET

NS = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main',
      'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'}
ZONE = ('A1', 'A2', 'A3', 'C1', 'C2')
MAX_FILE = 10 * 1024 * 1024
MAX_UNPACKED = 64 * 1024 * 1024
MAX_MEMBER = 12 * 1024 * 1024
DIGITS = str.maketrans('٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789')
CODE = re.compile(r'([AC]\s*[1-9])\s*[-–—]?\s*F\s*(\d{1,2})\s*[-–—]\s*(G?\d{1,2})', re.I)


def clean(value):
    return re.sub(r'\s+', ' ', str(value or '').translate(DIGITS)).strip()


def normalize_code(text):
    """Normalize a single code; invalid syntax returns None, never guesses digits."""
    match = CODE.fullmatch(clean(text))
    if not match:
        return None
    tower, floor, pos = match.groups()
    pos = 'G' + str(int(pos[1:])) if pos.upper().startswith('G') else f'{int(pos):02d}'
    return f'{tower.upper().replace(" ", "")}-F{int(floor)}-{pos}'


def extract_codes(text):
    text = str(text or '').translate(DIGITS)
    found = []
    for match in CODE.finditer(text):
        code = normalize_code(match.group())
        if code and code not in found:
            found.append(code)
        # Compact lists such as A3-F05-01/02 are one row, not one apartment.
        suffix = re.match(r'((?:\s*/\s*\d{1,2})+)', text[match.end():])
        if suffix and code:
            base = code.rsplit('-', 1)[0]
            for pos in re.findall(r'\d+', suffix.group()):
                expanded = f'{base}-{int(pos):02d}'
                if expanded not in found:
                    found.append(expanded)
    return found


def number(value):
    value = clean(value).replace(',', '').replace('٬', '').replace('٫', '.')
    if not re.fullmatch(r'[-+]?\d+(?:\.\d+)?', value):
        return None
    result = float(value)
    return result if math.isfinite(result) and abs(result) <= 1e15 else None


def area_number(value):
    value = clean(value)
    match = re.fullmatch(r'(\d+(?:[.,]\d+)?)\s*(?:م\s*(?:2|²)|M2|M²)?', value, re.I)
    return number(match.group(1).replace(',', '.')) if match else None


def stable_id(*parts):
    return hashlib.sha256(json.dumps(parts, ensure_ascii=False, sort_keys=True).encode()).hexdigest()[:24]


class Workbook:
    """Bounded OOXML reader, intentionally without evaluating formula expressions."""

    def __init__(self, path):
        self.path = Path(path)
        if self.path.stat().st_size > MAX_FILE:
            raise ValueError('حجم ملف الاستيراد يتجاوز 10 ميغابايت.')
        try:
            self.z = zipfile.ZipFile(self.path)
        except (zipfile.BadZipFile, OSError) as exc:
            raise ValueError('الملف ليس مصنف XLSX صالحاً.') from exc
        try:
            self._load()
        finally:
            self.z.close()

    def xml(self, name):
        if name not in self.names:
            return None
        data = self.z.read(name)
        if re.search(br'<!\s*(?:DOCTYPE|ENTITY)\b', data.replace(b'\0', b''), re.I):
            raise ValueError('يتضمن المصنف تعريف XML غير مسموح.')
        try:
            return ET.fromstring(data)
        except ET.ParseError as exc:
            raise ValueError('بنية XML في المصنف غير صالحة.') from exc

    def _load(self):
        members = self.z.infolist()
        if len(members) > 512 or sum(i.file_size for i in members) > MAX_UNPACKED:
            raise ValueError('بنية المصنف تتجاوز حدود الاستيراد الآمن.')
        self.names = set()
        for item in members:
            p = PurePosixPath(item.filename)
            if (item.filename in self.names or p.is_absolute() or '..' in p.parts
                    or '\\' in item.filename or item.file_size > MAX_MEMBER
                    or item.flag_bits & 1 or item.compress_type not in (0, 8)
                    or (item.file_size > 1024 * 1024 and item.file_size / max(item.compress_size, 1) > 250)):
                raise ValueError('يتضمن المصنف عضواً مضغوطاً غير مسموح.')
            self.names.add(item.filename)
        wb = self.xml('xl/workbook.xml')
        rels = self.xml('xl/_rels/workbook.xml.rels')
        if wb is None or rels is None:
            raise ValueError('المصنف لا يحتوي بنية Excel المطلوبة.')
        self.date1904 = wb.find('s:workbookPr', NS) is not None and wb.find('s:workbookPr', NS).get('date1904') in ('1', 'true')
        relmap = {}
        for rel in rels:
            if rel.get('TargetMode') == 'External':
                continue
            target = rel.get('Target', '')
            if '\\' in target or '..' in PurePosixPath(target).parts:
                raise ValueError('مسار ورقة العمل غير مسموح.')
            target = target.lstrip('/') if target.startswith('/') else 'xl/' + target
            relmap[rel.get('Id')] = target
        shared = self.xml('xl/sharedStrings.xml')
        self.shared = [''.join(t.text or '' for t in si.findall('.//s:t', NS)) for si in shared] if shared is not None else []
        styles = self.xml('xl/styles.xml')
        self.fills = []
        self.style_fills = []
        if styles is not None:
            for fill in styles.findall('s:fills/s:fill', NS):
                pattern = fill.find('s:patternFill', NS)
                color = pattern.find('s:fgColor', NS) if pattern is not None else None
                key = None
                if color is not None and pattern.get('patternType') == 'solid':
                    if 'rgb' in color.attrib:
                        key = 'rgb:' + color.get('rgb')[-6:].upper()
                    elif 'theme' in color.attrib:
                        key = 'theme:' + color.get('theme')
                        if float(color.get('tint', '0')) != 0:
                            key += ':tint:' + color.get('tint')
                    elif 'indexed' in color.attrib:
                        key = 'indexed:' + color.get('indexed')
                self.fills.append(key)
            self.style_fills = [int(x.get('fillId', '0')) for x in styles.findall('s:cellXfs/s:xf', NS)]
        self.sheets = {}
        for sheet in wb.findall('s:sheets/s:sheet', NS):
            root = self.xml(relmap.get(sheet.get('{' + NS['r'] + '}id'), ''))
            if root is None:
                continue
            rows = []
            for row in root.findall('s:sheetData/s:row', NS):
                rid = int(row.get('r', '0'))
                if rid > 100000:
                    raise ValueError('عدد صفوف المصنف يتجاوز حد الاستيراد.')
                cells = {}
                for c in row.findall('s:c', NS):
                    ref = c.get('r', '')
                    col = re.sub(r'\d', '', ref)
                    value = c.find('s:v', NS)
                    value = value.text or '' if value is not None else ''
                    if c.get('t') == 's':
                        try:
                            value = self.shared[int(value)]
                        except (ValueError, IndexError):
                            raise ValueError('مرجع نص غير صالح داخل المصنف.')
                    elif c.get('t') == 'inlineStr':
                        value = ''.join(t.text or '' for t in c.findall('.//s:t', NS))
                    style = int(c.get('s', '0'))
                    fid = self.style_fills[style] if 0 <= style < len(self.style_fills) else 0
                    cells[col] = {'value': value, 'cell': ref, 'style': style,
                                  'fill': self.fills[fid] if 0 <= fid < len(self.fills) else None,
                                  'formula': c.findtext('s:f', None, NS)}
                rows.append((rid, cells))
            self.sheets[sheet.get('name')] = rows

    def as_date(self, value):
        value = clean(value)
        n = number(value)
        if n is not None and 20000 < n < 100000:
            base = datetime(1904, 1, 1) if self.date1904 else datetime(1899, 12, 30)
            return (base + timedelta(days=n)).date().isoformat()
        for fmt in ('%Y-%m-%d', '%d/%m/%Y', '%d-%m-%Y', '%Y/%m/%d'):
            try:
                return datetime.strptime(value, fmt).date().isoformat()
            except ValueError:
                pass
        return None


def valid_parts(code):
    match = re.fullmatch(r'([AC][1-9])-F(\d+)-(\d+)', code or '')
    if not match:
        return None
    tower, floor, pos = match.groups()
    floor, pos = int(floor), int(pos)
    top, positions = (29, 4) if tower.startswith('A') else (35, 6)
    if not (1 <= floor <= top and 1 <= pos <= (2 if floor == top else positions)):
        return None
    return tower, floor, pos


def baseline_codes():
    """Structural expectation only; never imports demo values or fictitious clients."""
    for tower in ZONE:
        top, per_floor, outward = (29, 4, 2) if tower[0] == 'A' else (35, 6, 3)
        for floor in range(1, top + 1):
            positions = 2 if floor == top else outward if floor <= 3 else per_floor
            for pos in range(1, positions + 1):
                yield f'{tower}-F{floor}-{pos:02d}'


def parse_workbook(path):
    wb = Workbook(path)
    fingerprint = hashlib.sha256(Path(path).read_bytes()).hexdigest()
    data = {'meta': {'source_filename': Path(path).name, 'source_sha256': fingerprint,
                     'source_date': None, 'parsed_at': datetime.now(timezone.utc).isoformat(),
                     'schema_version': 1, 'date_system': '1904' if wb.date1904 else '1900'},
            'units': [], 'events': [], 'issues': [], 'out_of_scope': [], 'unresolved_records': []}
    issues, units, events = data['issues'], {}, data['events']
    counts = Counter()

    def issue(kind, message, code=None, source=None):
        rec = {'id': stable_id(kind, code, source, message), 'kind': kind, 'message': message,
               'code': code, 'source': source}
        if not any(x['id'] == rec['id'] for x in issues):
            issues.append(rec)
        return message

    def v(row, key):
        return row.get(key, {}).get('value', '')

    def raw(row):
        return {key: dict(cell) for key, cell in row.items() if cell['value'] or cell['formula']}

    # Only explicit legend headers establish a color meaning. A blue report total
    # labelled "sold/reserved" is not allowed to overwrite the bulk-allocation key.
    legends = {}
    for sheet, rows in wb.sheets.items():
        if 'report' not in sheet.lower():
            continue
        for rid, row in rows:
            for cell in row.values():
                label = clean(cell['value'])
                meaning = ('reserved' if label == 'عدد المحجوز' else
                           'deposit_paid' if label == 'عدد المدفوع عربون' else
                           'sold' if label == 'عدد المباع' else
                           'bulk' if label == 'شقق الجملة' else None)
                if meaning and cell['fill']:
                    prior = legends.get(cell['fill'])
                    if prior and prior != meaning:
                        issue('legend_conflict', 'تعارض في تعريف لون الحالة؛ يلزم اعتماد تفسيره.', source={'sheet': sheet, 'row': rid})
                        legends[cell['fill']] = 'conflict'
                    else:
                        legends[cell['fill']] = meaning

    def blank_unit(code, source=None):
        tower, floor, pos = valid_parts(code)
        return {'code': code, 'tower': tower, 'type': tower[0], 'floor': floor, 'pos': pos,
                'area': None, 'view': None, 'status': 'unknown', 'review_required': True,
                'review_reasons': [], 'allocation': 'unknown', 'payment_status': 'unknown',
                'price_per_m2': None, 'deposit': None, 'client_name': None, 'client_phone': None,
                'salesperson_name': None, 'date': None, 'source': source, 'source_records': [], 'raw': {}}

    # Read tower inventory, resolving column layouts using the actual headers.
    for sheet, rows in wb.sheets.items():
        if sheet not in ZONE + ('C3',):
            continue
        header = None
        for rid, row in rows:
            if any(clean(v(row, key)) == 'اسم العميل' for key in row):
                header = row
                break
        if not header:
            issue('missing_inventory_header', 'تعذر تحديد أعمدة جدول وحدات البرج.', source={'sheet': sheet})
            continue
        label_cols = {clean(c['value']): k for k, c in header.items() if clean(c['value'])}
        code_col = 'F' if sheet == 'A1' else 'G'
        floor_col, pos_col, desc_col, area_col = ('B', 'C', 'D', 'E') if sheet == 'A1' else ('C', 'D', 'E', 'F')
        for rid, row in rows:
            original = v(row, code_col)
            code = normalize_code(original)
            if not code:
                continue
            desc = clean(v(row, desc_col))
            source = {'sheet': sheet, 'row': rid, 'code_original': original}
            observation = {'source': source, 'code': code, 'raw': raw(row)}
            if sheet == 'C3':
                data['out_of_scope'].append({'kind': 'inventory', **observation})
                continue
            if '-G' in code or any(word in desc for word in ('خدمات', 'كراج', 'مدخل')):
                counts['service_rows_excluded'] += 1
                continue
            if not valid_parts(code) or valid_parts(code)[0] != sheet:
                issue('invalid_code', 'كود الوحدة لا يطابق طابقاً وموقعاً صالحين؛ لم يصحح تلقائياً.', code, source)
                data['unresolved_records'].append(observation)
                continue
            counts['valid_source_inventory_rows'] += 1
            unit = blank_unit(code, source)
            unit['raw'] = raw(row)
            unit['source_records'].append(observation)
            unit['area'] = area_number(v(row, area_col))
            unit['view'] = None if ('خارجية' in desc and 'داخلية' in desc) else 'ext' if 'خارجية' in desc else 'int' if 'داخلية' in desc else None
            unit['unit_kind'] = 'penthouse' if unit['floor'] == (29 if sheet[0] == 'A' else 35) else 'apartment'
            unit['client_name'] = clean(v(row, label_cols.get('اسم العميل'))) or None
            unit['client_phone'] = clean(v(row, label_cols.get('رقم هاتف العميل'))) or None
            unit['salesperson_name'] = clean(v(row, label_cols.get('موظف المبيعات'))) or None
            unit['deposit'] = number(v(row, label_cols.get('المبلغ المدفوع')))
            unit['date'] = wb.as_date(v(row, label_cols.get('تاريخ دفع العربون'))) or wb.as_date(v(row, label_cols.get('تاريخ الزيارة')))
            unit['raw']['_date_kind'] = 'deposit_or_visit_date_not_snapshot_date'
            fill = row.get(code_col, {}).get('fill')
            meaning = legends.get(fill)
            unit['raw']['_status_evidence'] = {'cell': row.get(code_col, {}).get('cell'), 'fill': fill, 'legend': meaning}
            if meaning == 'sold':
                unit['status'] = 'sold'
            elif meaning in ('reserved', 'deposit_paid'):
                unit['status'] = 'reserved'
            if meaning == 'deposit_paid' or (unit['deposit'] is not None and unit['deposit'] > 0):
                unit['payment_status'] = 'payment_recorded'
            if meaning == 'bulk':
                unit['allocation'] = 'bulk'
            if unit['status'] == 'unknown':
                unit['review_reasons'].append(issue('status_unverified', 'حالة البيع غير مثبتة بدليل مستقل؛ الفراغ أو لون غير مفسر لا يثبت الإتاحة.', code, source))
            if fill and meaning is None:
                unit['review_reasons'].append(issue('unknown_fill', 'لون الوحدة غير مشروح في دليل الألوان؛ يحتاج تفسير المدير.', code, source))
            if unit['area'] is None or unit['area'] <= 0:
                unit['review_reasons'].append(issue('area_missing', 'المساحة غير متوفرة أو غير رقمية؛ يلزم اعتمادها قبل الحجز.', code, source))
            elif unit['area'] in (181, 237):
                unit['review_reasons'].append(issue('area_rounded', 'المساحة مدونة بصورة مدورة في المصدر؛ احتفظنا بها دون استبدالها بمساحة هندسية مفترضة.', code, source))
            floor_value, pos_value = number(v(row, floor_col)), number(v(row, pos_col))
            if floor_value != unit['floor'] or pos_value != unit['pos']:
                unit['review_reasons'].append(issue('geometry_conflict', 'الطابق أو موقع الشقة في الأعمدة لا يطابق الكود.', code, source))
            if sheet == 'A1' and unit['floor'] <= 3 and unit['pos'] == 4:
                unit['review_reasons'].append(issue('garage_conflict', 'المصدر يصف شقة بالموقع 04 في الطوابق 1–3 خلاف مخطط الكراجات السابق؛ يلزم اعتماد هندسي.', code, source))
            if unit['status'] in ('reserved', 'sold') and not unit['client_name']:
                unit['review_reasons'].append(issue('client_missing', 'الحالة مثبتة باللون لكن اسم العميل غير متوفر.', code, source))
            if unit['client_name'] and unit['client_name'].upper() in ('PENTHOUSE', 'متاح', 'محجوز', 'مباع', 'كراج', 'خدمات'):
                unit['review_reasons'].append(issue('client_invalid', 'حقل اسم العميل يتضمن وصفاً للوحدة ويحتاج مراجعة.', code, source))
                unit['client_name'] = None
            if code in units:
                counts['duplicate_inventory_rows'] += 1
                units[code]['source_records'].append(observation)
                units[code]['review_reasons'].append(issue('duplicate_inventory', 'كود مكرر في جدول الوحدات؛ احتفظنا بالسجلات للمطابقة.', code, source))
                units[code]['review_required'] = True
            else:
                unit['review_required'] = bool(unit['review_reasons'])
                units[code] = unit

    if not counts['valid_source_inventory_rows']:
        raise ValueError('لم نجد جدول وحدات صالحاً لأبراج الزون الأول في المصنف.')

    # Operational ledgers retain original amounts (never split a payment equally
    # across multiple units) and purchase/visit dates distinct from cancellation dates.
    kinds = {'ملف الحجز': 'reservation', 'الغاء حجز': 'cancellation', 'ملف الشراء': 'purchase'}
    event_occurrences = Counter()
    for sheet, rows in wb.sheets.items():
        if clean(sheet) not in kinds:
            continue
        kind = kinds[clean(sheet)]
        for rid, row in rows:
            if number(v(row, 'A')) is None or not clean(v(row, 'B')):
                continue
            original = v(row, 'G')
            codes = extract_codes(original)
            is_transfer = bool(re.search(r'\bFROM\b', str(original), re.I) and re.search(r'\bTO\b', str(original), re.I))
            effective_kind = 'transfer' if is_transfer else kind
            source = {'sheet': sheet, 'row': rid, 'code_original': original}
            # Semantic ID is independent of source filename/hash; repeating a ledger
            # in a later workbook cannot create new movements merely due to repackaging.
            semantic = stable_id('ledger', sheet.strip(), {k: v(row, k) for k in row if v(row, k) and k != 'A'})
            event_occurrences[semantic] += 1
            event = {'id': stable_id(semantic, event_occurrences[semantic]),
                     'kind': effective_kind, 'unit_codes': codes, 'client_name': clean(v(row, 'B')) or None,
                     'client_phone': clean(v(row, 'E')) or None, 'salesperson_name': clean(v(row, 'F')) or None,
                     'date': wb.as_date(v(row, 'K')) or wb.as_date(v(row, 'C')) if kind == 'reservation' else wb.as_date(v(row, 'C')) if kind == 'purchase' else None,
                     'date_kind': 'deposit_or_visit' if kind == 'reservation' else 'purchase' if kind == 'purchase' else 'cancellation_date_unavailable',
                     'price_per_m2': number(v(row, 'J' if kind == 'reservation' else 'I')) if kind != 'cancellation' else None,
                     'deposit': number(v(row, 'J' if kind == 'purchase' else 'I')),
                     'source': source, 'raw': raw(row), 'area': area_number(v(row, 'H')),
                     'reference_number': clean(v(row, 'K' if kind == 'cancellation' else 'L')) or None,
                     'review_reasons': [], 'source_ledger_kind': kind}
            if kind == 'cancellation':
                event['related_purchase_date'] = wb.as_date(v(row, 'C'))
                event['reason'] = clean(v(row, 'J'))
                event['review_reasons'].append('لا يوجد تاريخ إلغاء مستقل؛ لم يستخدم تاريخ الشراء كتاريخ للإلغاء.')
            if is_transfer:
                pieces = re.split(r'\bTO\b', str(original), maxsplit=1, flags=re.I)
                event['from_codes'] = extract_codes(pieces[0])
                event['to_codes'] = extract_codes(pieces[1]) if len(pieces) == 2 else []
                event['review_reasons'].append('حركة تحويل محفوظة؛ يلزم التحقق من نفاذها وتاريخها قبل تغيير حالة الطرفين.')
            if len(codes) > 1:
                event['review_reasons'].append('حركة مشتركة لعدة وحدات؛ لم توزع المبالغ أو المساحات على الوحدات تلقائياً.')
            if not codes:
                event['review_reasons'].append(issue('event_without_code', 'حركة تاريخية بلا كود وحدة واضح؛ تتطلب ربطاً مع الحجز الصحيح.', source=source))
            if any(not valid_parts(c) for c in codes):
                event['review_reasons'].append(issue('event_invalid_code', 'حركة تحتوي كوداً غير صالح؛ لم يصحح تلقائياً.', source=source))
            if codes and all(c.split('-')[0] not in ZONE for c in codes):
                data['out_of_scope'].append({'kind': 'ledger', 'event_id': event['id'], 'source': source, 'unit_codes': codes})
            events.append(event)

    # Cancellations are linked to matching client + phone or ledger form, never
    # every booking of a reused code. Missing cancellation dates stay unresolved.
    for event in events:
        if event['kind'] != 'cancellation':
            continue
        candidates = []
        for earlier in events:
            if earlier['kind'] not in ('reservation', 'purchase', 'transfer'):
                continue
            same_client = clean(earlier['client_name']) == clean(event['client_name'])
            same_ref = event['reference_number'] and earlier['reference_number'] == event['reference_number']
            same_phone = event['client_phone'] and clean(earlier['client_phone']) == clean(event['client_phone'])
            if same_client and (same_ref or same_phone) and (not event['unit_codes'] or set(event['unit_codes']).intersection(earlier['unit_codes'])):
                candidates.append(earlier)
        event['candidate_event_ids'] = [e['id'] for e in candidates]
        if not event['unit_codes'] and len(candidates) == 1:
            event['candidate_unit_codes'] = candidates[0]['unit_codes']
        issue('cancellation_needs_review', 'إلغاء تاريخي محفوظ مع روابط المطابقة المحتملة؛ لم يطلق أي وحدة دون إثبات الحجز وتاريخ الإلغاء.', source=event['source'])

    event_map = defaultdict(list)
    for event in events:
        for code in event['unit_codes'] + event.get('candidate_unit_codes', []):
            if valid_parts(code) and code.split('-')[0] in ZONE:
                event_map[code].append(event)
    for code in baseline_codes():
        if code not in units:
            unit = blank_unit(code)
            unit['review_reasons'].append(issue('missing_inventory_code', 'كود متوقع من توزيع الواجهة السابقة غير موجود بصيغة سليمة في جدول المصدر؛ سجل مراجعة فقط.', code))
            units[code] = unit
            counts['missing_baseline_codes'] += 1
    for code, related in event_map.items():
        if code not in units:
            unit = blank_unit(code)
            unit['review_reasons'].append(issue('ledger_only_unit', 'الوحدة مذكورة في سجل العمليات وغير مثبتة بجدول وحدات البرج.', code))
            units[code] = unit
        unit = units[code]
        unit['source_records'].extend({'event_id': e['id'], 'kind': e['kind'], 'source': e['source']} for e in related)
        cancellations = [e for e in related if e['kind'] == 'cancellation']
        transfers = [e for e in related if e['kind'] == 'transfer']
        if cancellations:
            unit['review_reasons'].append(issue('cancellation_conflict', 'يوجد إلغاء تاريخي مرتبط أو مرشح؛ يلزم تحديد الحجز الملغى قبل اعتماد الوضع الحالي.', code, unit['source']))
        if transfers:
            unit['review_reasons'].append(issue('transfer_conflict', 'الوحدة طرف في تحويل تاريخي؛ يلزم التحقق من نفاذ التحويل وحالة الطرفين.', code, unit['source']))
        positives = [e for e in related if e['kind'] in ('reservation', 'purchase')]
        names = {clean(e['client_name']) for e in positives if e['client_name']}
        if unit['client_name']:
            names.add(clean(unit['client_name']))
        if len(names) > 1:
            unit['review_reasons'].append(issue('client_history_conflict', 'سجلات الوحدة تتضمن أكثر من عميل؛ لم يستبدل العميل الحالي بعميل تاريخي تلقائياً.', code, unit['source']))
        matching = [e for e in positives if len(e['unit_codes']) == 1 and (not unit['client_name'] or clean(e['client_name']) == clean(unit['client_name']))]
        matching.sort(key=lambda e: (e['date'] or '', e['source']['row']))
        if unit['status'] == 'unknown' and positives and not cancellations and not transfers:
            # A ledger proves a reservation/purchase observation, but does not prove
            # that a fully-paid advance is an executed sales contract.
            unit['status'] = 'reserved'
            unit['review_reasons'].append(issue('history_status_unconfirmed', 'سجل حجز أو شراء موجود لكن حالة التنفيذ الحالية وتاريخ تحديث الكشف يحتاجان اعتماداً.', code, unit['source']))
        if matching and len(names) <= 1 and not cancellations and not transfers:
            chosen = matching[-1]
            for key in ('client_name', 'client_phone', 'salesperson_name', 'price_per_m2', 'deposit', 'date'):
                if unit[key] is None:
                    unit[key] = chosen[key]
            if chosen.get('area') and unit['area'] and abs(chosen['area'] - unit['area']) > 1:
                unit['review_reasons'].append(issue('area_history_conflict', 'مساحة سجل العملية تختلف عن مساحة جدول الوحدة؛ احتفظنا بالمصدرين للمراجعة.', code, chosen['source']))
        unit['review_required'] = bool(unit['review_reasons'])

    for unit in units.values():
        unit['review_reasons'] = list(dict.fromkeys(unit['review_reasons']))
        unit['review_required'] = bool(unit['review_reasons'])
    data['units'] = sorted(units.values(), key=lambda u: (ZONE.index(u['tower']), u['floor'], u['pos']))
    events.sort(key=lambda e: (e['date'] is None, e['date'] or '', e['source']['sheet'], e['source']['row']))
    dates = sorted(e['date'] for e in events if e['date'])
    by_tower = {}
    for tower in ZONE:
        us = [u for u in data['units'] if u['tower'] == tower]
        by_tower[tower] = {'total': len(us), 'by_status': dict(Counter(u['status'] for u in us)),
                           'review_required': sum(u['review_required'] for u in us)}
    data['summary'] = {'total_units': len(units), 'by_tower': by_tower,
                       'valid_source_inventory_rows': counts['valid_source_inventory_rows'],
                       'by_status': dict(Counter(u['status'] for u in data['units'])),
                       'review_required': sum(u['review_required'] for u in data['units']),
                       'event_count': len(events), 'event_counts': dict(Counter(e['kind'] for e in events)),
                       'issue_count': len(issues), 'issue_counts': dict(Counter(i['kind'] for i in issues)),
                       'out_of_scope_count': len(data['out_of_scope']), 'unresolved_records': len(data['unresolved_records']),
                       'service_rows_excluded': counts['service_rows_excluded'],
                       'missing_baseline_codes': counts['missing_baseline_codes'],
                       'duplicate_inventory_rows': counts['duplicate_inventory_rows'],
                       'source_status_legend': legends,
                       'date_range': {'from': dates[0] if dates else None, 'to': dates[-1] if dates else None},
                       'source_sheets': list(wb.sheets),
                       'ancillary_sheets': [{'sheet': s, 'rows': len(rows)} for s, rows in wb.sheets.items() if s not in ZONE + ('C3',) and clean(s) not in kinds],
                       'notes': ['البيانات المعلنة للإتاحة تتطلب دليلاً واعتماد المدير؛ الفراغ لا يعني متاحاً.',
                                 'تواريخ الحركات لا تمثل تاريخ آخر تحديث لكشف الوحدات.',
                                 'المبالغ محفوظة من المصدر دون اعتبارها إيرادات أو توزيع مبلغ مشترك تلقائياً.',
                                 'ملف المصدر الأصلي محفوظ؛ بيانات CRM والزيارات لا تنشئ حجوزات أو حسابات دخول.',
                                 'أكواد المراجعة المتوقعة ليست إثباتاً هندسياً لوجود وحدة.']}
    return data


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description='Create a private Golden City import preview.')
    parser.add_argument('workbook')
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    result = parse_workbook(args.workbook)
    Path(args.output).parent.mkdir(parents=True, exist_ok=True)
    Path(args.output).write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(result['summary'], ensure_ascii=False, indent=2))
