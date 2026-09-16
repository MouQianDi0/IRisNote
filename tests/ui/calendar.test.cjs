const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

const root = path.resolve(__dirname, '../..');
const resolve = Module._resolveFilename;

function resolveAlias(name) {
  let resolved = path.join(root, 'src', name.slice(2));
  if (path.extname(resolved)) {
    return resolved;
  }
  if (fs.existsSync(`${resolved}.ts`)) {
    return `${resolved}.ts`;
  }
  if (fs.existsSync(`${resolved}.tsx`)) {
    return `${resolved}.tsx`;
  }
  const indexTs = path.join(resolved, 'index.ts');
  if (fs.existsSync(indexTs)) {
    return indexTs;
  }
  const indexTsx = path.join(resolved, 'index.tsx');
  if (fs.existsSync(indexTsx)) {
    return indexTsx;
  }
  return resolved;
}

Module._resolveFilename = function (name, ...args) {
  if (name.startsWith('@/')) {
    return resolveAlias(name);
  }
  return resolve.call(this, name, ...args);
};

require.extensions['.ts'] = (module, filename) => {
  const result = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filename,
  });
  module._compile(result.outputText, filename);
};

const {
  addDays,
  addMonths,
  addWeeks,
  compareDateId,
  formatMonthTitle,
  fromDateId,
  isDateInMonth,
  startOfWeekId,
  toDateId,
  toMonthId,
  weekdayLabels,
} = require('@/shared/utils/date-id.ts');

const {
  anchorDateId,
  buildWeekWindow,
  collapseWeekId,
  expandMonthId,
  isCalendarRange,
  nextRangeValue,
  nextSingleValue,
  rangePhaseFromValue,
  resolveInitialMonthId,
  shiftMonthWithinBounds,
  toActiveDateRanges,
} = require('@/shared/ui/Calendar/calendar-logic.ts');

test('toDateId/fromDateId 本地时区往返不失真', () => {
  const ids = [
    '2026-01-01',
    '2026-09-16',
    '2024-02-29',
    '2026-12-31',
    '1999-06-15',
  ];
  for (const id of ids) {
    const date = fromDateId(id);
    assert.equal(date.getFullYear(), Number(id.slice(0, 4)));
    assert.equal(date.getMonth(), Number(id.slice(5, 7)) - 1);
    assert.equal(date.getDate(), Number(id.slice(8, 10)));
    assert.equal(toDateId(date), id);
  }
});

test('addDays 跨月/闰年/年末边界', () => {
  assert.equal(addDays('2024-02-28', 1), '2024-02-29');
  assert.equal(addDays('2023-02-28', 1), '2023-03-01');
  assert.equal(addDays('2026-01-31', 1), '2026-02-01');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-01-01', -1), '2025-12-31');
  assert.equal(addWeeks('2026-09-14', 1), '2026-09-21');
  assert.equal(addWeeks('2026-09-14', -2), '2026-08-31');
});

test('月份工具：toMonthId/addMonths/isDateInMonth', () => {
  assert.equal(toMonthId('2026-09-16'), '2026-09-01');
  assert.equal(addMonths('2025-12-01', 1), '2026-01-01');
  assert.equal(addMonths('2026-01-01', -1), '2025-12-01');
  assert.equal(addMonths('2026-09-01', 13), '2027-10-01');
  assert.equal(isDateInMonth('2026-09-30', '2026-09-01'), true);
  assert.equal(isDateInMonth('2026-10-01', '2026-09-01'), false);
});

test('startOfWeekId 两种周起点（2026-09-16 为周三）', () => {
  assert.equal(startOfWeekId('2026-09-16', 'monday'), '2026-09-14');
  assert.equal(startOfWeekId('2026-09-16', 'sunday'), '2026-09-13');
  // 周日当天：周一起头应回退 6 天，周日起头应保持当天
  assert.equal(startOfWeekId('2026-09-20', 'monday'), '2026-09-14');
  assert.equal(startOfWeekId('2026-09-20', 'sunday'), '2026-09-20');
  // 周一当天：周一起头保持当天
  assert.equal(startOfWeekId('2026-09-14', 'monday'), '2026-09-14');
});

test('格式化：月份标题与星期列表头', () => {
  assert.equal(formatMonthTitle('2026-09-01'), '2026年9月');
  assert.equal(formatMonthTitle('2026-12-01'), '2026年12月');
  assert.deepEqual(weekdayLabels('monday'), [
    '一',
    '二',
    '三',
    '四',
    '五',
    '六',
    '日',
  ]);
  assert.deepEqual(weekdayLabels('sunday'), [
    '日',
    '一',
    '二',
    '三',
    '四',
    '五',
    '六',
  ]);
  assert.equal(compareDateId('2026-09-01', '2026-09-02'), -1);
  assert.equal(compareDateId('2026-09-02', '2026-09-01'), 1);
  assert.equal(compareDateId('2026-09-02', '2026-09-02'), 0);
});

test('single 模式：点击即选中，再点已选日不取消', () => {
  assert.equal(nextSingleValue('2026-09-10', '2026-09-11'), '2026-09-11');
  assert.equal(nextSingleValue('2026-09-11', '2026-09-11'), '2026-09-11');
  assert.equal(nextSingleValue(null, '2026-09-11'), '2026-09-11');
});

test('range 模式：起点→终点→早于起点重设→第三击重来→同日完成', () => {
  // 第一击：新起点（临时终点=起点）
  let state = nextRangeValue(null, '2026-09-10', 'idle');
  assert.deepEqual(state, {
    value: { startDateId: '2026-09-10', endDateId: '2026-09-10' },
    phase: 'pending',
  });
  // pending 中点击同一天：完成单日范围
  state = nextRangeValue(state.value, '2026-09-10', state.phase);
  assert.deepEqual(state, {
    value: { startDateId: '2026-09-10', endDateId: '2026-09-10' },
    phase: 'done',
  });
  // 重新开始：pending，再点早于起点 → 起点重设
  state = nextRangeValue(state.value, '2026-09-12', state.phase);
  assert.equal(state.phase, 'pending');
  state = nextRangeValue(state.value, '2026-09-08', state.phase);
  assert.deepEqual(state, {
    value: { startDateId: '2026-09-08', endDateId: '2026-09-08' },
    phase: 'pending',
  });
  // 晚于起点 → 补终点完成
  state = nextRangeValue(state.value, '2026-09-15', state.phase);
  assert.deepEqual(state, {
    value: { startDateId: '2026-09-08', endDateId: '2026-09-15' },
    phase: 'done',
  });
  // 已完成后第三击：放弃当前范围，新起点
  state = nextRangeValue(state.value, '2026-09-20', state.phase);
  assert.deepEqual(state, {
    value: { startDateId: '2026-09-20', endDateId: '2026-09-20' },
    phase: 'pending',
  });
});

test('rangePhaseFromValue / isCalendarRange', () => {
  assert.equal(rangePhaseFromValue(null), 'idle');
  assert.equal(rangePhaseFromValue('2026-09-10'), 'idle');
  assert.equal(
    rangePhaseFromValue({
      startDateId: '2026-09-08',
      endDateId: '2026-09-08',
    }),
    'idle',
  );
  assert.equal(
    rangePhaseFromValue({
      startDateId: '2026-09-08',
      endDateId: '2026-09-15',
    }),
    'done',
  );
  assert.equal(isCalendarRange(null), false);
  assert.equal(isCalendarRange('2026-09-08'), false);
  assert.equal(
    isCalendarRange({ startDateId: '2026-09-08', endDateId: '2026-09-15' }),
    true,
  );
});

test('toActiveDateRanges 按 mode 转换', () => {
  assert.deepEqual(toActiveDateRanges('single', '2026-09-10'), [
    { startId: '2026-09-10', endId: '2026-09-10' },
  ]);
  assert.deepEqual(toActiveDateRanges('single', null), []);
  assert.deepEqual(
    toActiveDateRanges('range', {
      startDateId: '2026-09-08',
      endDateId: '2026-09-15',
    }),
    [{ startId: '2026-09-08', endId: '2026-09-15' }],
  );
  assert.deepEqual(toActiveDateRanges('range', null), []);
});

test('anchorDateId / resolveInitialMonthId', () => {
  assert.equal(anchorDateId('2026-09-16', '2026-01-01'), '2026-09-16');
  assert.equal(
    anchorDateId(
      { startDateId: '2026-09-08', endDateId: '2026-09-15' },
      '2026-01-01',
    ),
    '2026-09-08',
  );
  assert.equal(anchorDateId(null, '2026-01-01'), '2026-01-01');
  // value 所在月优先
  assert.equal(
    resolveInitialMonthId('2026-09-16', undefined, '2026-01-01'),
    '2026-09-01',
  );
  // 无 value 用 initialMonthId
  assert.equal(
    resolveInitialMonthId(null, '2026-08-01', '2026-01-01'),
    '2026-08-01',
  );
  // 都无则当月
  assert.equal(
    resolveInitialMonthId(null, undefined, '2026-01-31'),
    '2026-01-01',
  );
});

test('shiftMonthWithinBounds 边界钳制', () => {
  assert.equal(
    shiftMonthWithinBounds('2026-09-01', -1, '2026-08-15', '2026-12-31'),
    '2026-08-01',
  );
  // 目标月早于 min 所在月 → null
  assert.equal(
    shiftMonthWithinBounds('2026-08-01', -1, '2026-08-15', undefined),
    null,
  );
  // min 当月仍可停留（min=08-15，08-01 → 07-01 越界；08-01 → 09-01 合法）
  assert.equal(
    shiftMonthWithinBounds('2026-08-01', 1, '2026-08-15', undefined),
    '2026-09-01',
  );
  assert.equal(
    shiftMonthWithinBounds('2026-12-01', 1, undefined, '2026-12-31'),
    null,
  );
  assert.equal(
    shiftMonthWithinBounds('2026-09-01', 1, undefined, undefined),
    '2026-10-01',
  );
});

test('expandMonthId / collapseWeekId 锚定', () => {
  // 展开：优先选中值所在月
  assert.equal(expandMonthId('2026-09-16', '2026-08-31'), '2026-09-01');
  assert.equal(expandMonthId(null, '2026-08-31'), '2026-08-01');
  // 收起：有选中取其周
  assert.equal(
    collapseWeekId('2026-09-16', '2026-09-01', 'monday', '2026-01-01'),
    '2026-09-14',
  );
  // 无选中且当日在当前月 → 当日所在周
  assert.equal(
    collapseWeekId(null, '2026-09-01', 'monday', '2026-09-16'),
    '2026-09-14',
  );
  // 无选中且当日不在当前月 → 当前月首周（2026-09-01 为周二，周一起头回退到 08-31）
  assert.equal(
    collapseWeekId(null, '2026-09-01', 'monday', '2026-01-01'),
    '2026-08-31',
  );
});

test('buildWeekWindow 窗口与边界钳制', () => {
  const shift = (weekId, weeks) => addWeeks(weekId, weeks);
  // 无边界：anchor ±3 共 7 周
  assert.deepEqual(
    buildWeekWindow('2026-09-14', 3, shift, undefined, undefined),
    [
      '2026-08-24',
      '2026-08-31',
      '2026-09-07',
      '2026-09-14',
      '2026-09-21',
      '2026-09-28',
      '2026-10-05',
    ],
  );
  // min 钳掉更早的周（中心 09-07，半径 3 → 08-17/08-24/08-31 被钳掉）
  assert.deepEqual(
    buildWeekWindow('2026-09-07', 3, shift, '2026-09-01', undefined),
    ['2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28'],
  );
  // max 钳掉更晚的周
  assert.deepEqual(
    buildWeekWindow('2026-09-14', 3, shift, undefined, '2026-09-20'),
    ['2026-08-24', '2026-08-31', '2026-09-07', '2026-09-14'],
  );
});
