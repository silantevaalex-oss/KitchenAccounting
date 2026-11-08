// Сценарные тесты синхронизации на РЕАЛЬНЫХ модулях (без заглушек recordContent / merge).
// Google Таблица имитируется в памяти: PUT пишет только переданные ячейки, чтение возвращает строки,
// пустые хвосты строк отбрасываются — как в Sheets API.
import test from 'node:test';
import assert from 'node:assert/strict';
import { versionNow, numberValue } from '../js/core.js';
import { normalizeRecord, parseSheetRecord, recordContent, mergeRecordLocalWins } from '../js/google-sheets.js';
import { ingredientContent, cardContent } from '../js/tech-cards.js';
import { mergeVersioned } from '../js/sync-merge.js';
import { createGoogleSync } from '../js/google-sync.js';

const letter = s => s.charCodeAt(0) - 65;

function makeSheet() {
  const tabs = { Products: [], Records: [], Ingredients: [], TechCards: [], TechCardIngredients: [] };
  const parse = range => {
    const [tab, rest] = range.split('!');
    const m = rest.match(/^([A-Z])(\d+)(?::([A-Z])(\d*))?$/);
    return { tab, c1: letter(m[1]), r1: +m[2], c2: m[3] ? letter(m[3]) : null };
  };
  const api = {
    hasToken: () => true,
    request: async path => path.includes('fields=') ? { sheets: Object.keys(tabs).map(title => ({ properties: { title } })) } : {},
    read: async range => {
      const { tab, c1, r1, c2 } = parse(range);
      return tabs[tab].slice(r1 - 1).map(row => {
        row = row || [];
        const end = c2 === null ? row.length - 1 : c2, out = [];
        for (let c = c1; c <= end; c++) out.push(row[c] === undefined || row[c] === null ? '' : String(row[c]));
        while (out.length && out[out.length - 1] === '') out.pop();
        return out;
      });
    },
    write: async (range, values) => {
      const { tab, c1, r1 } = parse(range);
      values.forEach((row, i) => { const target = tabs[tab][r1 - 1 + i] ??= []; row.forEach((v, j) => { target[c1 + j] = v; }); });
    }
  };
  return { tabs, api };
}

// Одно «устройство»: своё локальное состояние, общая таблица.
const device = records => ({ records, products: [], deletedIds: [], deletedAt: {}, ingredients: [], techCards: [] });

async function sync(sheet, state, resolveRecordConflict) {
  const statuses = [], store = new Map();
  const engine = createGoogleSync({
    api: sheet.api,
    storage: { getItem: k => store.get(k) || null, setItem: (k, v) => store.set(k, v) },
    keys: { records: 'r', products: 'p', deletedIds: 'd', deletedAt: 'da', ingredients: 'i', techCards: 'tc' },
    getState: () => state, setState: next => Object.assign(state, next),
    helpers: { normalizeRecord, parseSheetRecord, recordContent, mergeRecordLocalWins, versionNow, numberValue, mergeVersioned, ingredientContent, cardContent },
    ui: { $: () => null, renderAll() {}, googleStatus: s => statuses.push(s), scheduleGoogleSync() {}, resolveRecordConflict }
  });
  await engine.syncGoogle();
  return statuses.at(-1);
}

// Запись так, как её сохраняет форма «Новая обработка».
const rec = (id, stamp, product, extra = {}) => ({
  id, product, steaks: 0, unitWeight: 0, layout1: 3, layout2: 0, layout3: 0, layout4: 0,
  plannedYield: 3, actualYield: 2.8, yield: 2.8, stamp, comment: '', techCardScale: null,
  updatedAt: '2026-11-09T10:00:00.000Z', ...extra
});
const OK = /Синхронизация завершена/;
const header = ['ID', 'Дата и время', 'Продукт', 'Фактический выход', 'Плановый выход', 'Кол-во (шт)', 'Вес 1 шт (кг)', 'Комментарий', 'Статус', 'Пересчёт по техкарте', 'Версионный ID', 'Снимок данных', 'Время изменения', 'Время удаления'];

test('пустой комментарий остаётся пустым, а не превращается в «0»', () => {
  assert.equal(normalizeRecord({ id: 'a', product: 'X', comment: '', actualYield: 1 }).comment, '');
});

test('пустые строки в таблице не становятся записями', async () => {
  const sheet = makeSheet(); sheet.tabs.Records = [header, [], []];
  const state = device([rec('r1', '2026-11-09T10:00', 'Лосось')]);
  assert.match(await sync(sheet, state), OK);
  assert.deepEqual(state.records.map(r => r.id), ['r1']);
});

test('обычная запись переживает несколько синхронизаций подряд', async () => {
  const sheet = makeSheet(), state = device([rec('r1', '2026-11-09T10:00', 'Лосось')]);
  for (let i = 0; i < 3; i++) assert.match(await sync(sheet, state), OK);
  assert.equal(state.records.length, 1);
});

test('старая запись без поля unitWeight переживает повторные синхронизации', async () => {
  const legacy = { id: 'old1', product: 'Курица', steaks: 0, layout1: 2, layout2: 0, layout3: 0, layout4: 0, plannedYield: 2, actualYield: 1.9, yield: 1.9, stamp: '2026-11-01T09:00', comment: '' };
  const sheet = makeSheet(), state = device([legacy]);
  for (let i = 0; i < 3; i++) assert.match(await sync(sheet, state), OK, 'синхронизация #' + (i + 1));
});

test('таблица старого формата (без версий) синхронизируется без ошибок', async () => {
  const sheet = makeSheet();
  sheet.tabs.Records = [header.slice(0, 10), ['e1', '2026-11-05T09:00', 'Свинина', 4, 5, 0, 0, 'комментарий', '', '']];
  const state = device([{ id: 'e1', product: 'Свинина', steaks: 0, unitWeight: 0, layout1: 5, layout2: 0, layout3: 0, layout4: 0, plannedYield: 5, actualYield: 4, yield: 4, stamp: '2026-11-05T09:00', comment: 'комментарий', techCardScale: null }]);
  assert.match(await sync(sheet, state), OK);
  assert.equal(state.records[0].comment, 'комментарий');
});

test('правка старой версией: синхронизация останавливается, данные не теряются', async () => {
  const sheet = makeSheet(), state = device([rec('A', '2026-11-09T09:00', 'Первый'), rec('B', '2026-11-09T11:00', 'Третий')]);
  assert.match(await sync(sheet, state), OK);
  // Старый клиент пишет только колонки A–J, меняет порядок строк и правит комментарий записи B.
  await sheet.api.write('Records!A1', [
    header.slice(0, 10),
    ['A', '2026-11-09T09:00', 'Первый', 2.8, 3, 0, 0, '', ''],
    ['C', '2026-11-09T10:00', 'Добавлено старой версией', 1, 1, 0, 0, '', ''],
    ['B', '2026-11-09T11:00', 'Третий', 2.8, 3, 0, 0, 'правка старой версией', '']
  ]);
  assert.match(await sync(sheet, state), /без подтверждённой версии/);
  assert.match(await sync(sheet, state), /без подтверждённой версии/);
  assert.deepEqual(state.records.map(r => r.comment), ['', ''], 'локальные данные не изменились');
  assert.equal(sheet.tabs.Records[3][7], 'правка старой версией', 'таблица не перезаписана поверх чужой правки');
});

test('устаревшая копия на втором устройстве не затирает свежую правку', async () => {
  const sheet = makeSheet();
  const a = device([rec('r', '2026-11-09T10:00', 'Лосось')]), b = device([]);
  await sync(sheet, a); await sync(sheet, b);               // оба устройства видят одну запись
  assert.equal(b.records[0].comment, '');
  a.records[0] = { ...a.records[0], comment: 'правка на A', updatedAt: '2026-11-09T12:00:00.000Z' };
  assert.match(await sync(sheet, a), OK);
  assert.match(await sync(sheet, b), OK);                    // B не менял запись
  assert.equal(b.records[0].comment, 'правка на A');
  b.records[0] = { ...b.records[0], comment: 'правка на B', updatedAt: '2026-11-09T13:00:00.000Z' };
  await sync(sheet, b); await sync(sheet, a);
  assert.equal(a.records[0].comment, 'правка на B', 'более поздняя правка побеждает');
});

test('удаление новее правки убирает запись, правка новее удаления её сохраняет', async () => {
  for (const [deletedAt, survives] of [['2026-11-09T13:00:00.000Z', false], ['2026-11-09T11:00:00.000Z', true]]) {
    const sheet = makeSheet();
    await sync(sheet, device([rec('x', '2026-11-09T10:00', 'Лосось', { updatedAt: '2026-11-09T12:00:00.000Z' })]));
    const other = device([]); other.deletedIds = ['x']; other.deletedAt = { x: deletedAt };
    assert.match(await sync(sheet, other), OK);
    assert.equal(other.records.some(r => r.id === 'x'), survives, 'deletedAt=' + deletedAt);
    assert.equal(sheet.tabs.Records.some(row => row && row[0] === 'x' && row[8] === 'DELETE'), !survives);
  }
});

test('конфликт старой версии можно разрешить выбором локальной записи и продолжить синхронизацию', async () => {
  const sheet = makeSheet(), state = device([rec('A', '2026-11-09T09:00', 'Первый'), rec('B', '2026-11-09T11:00', 'Третий')]);
  assert.match(await sync(sheet, state), OK);
  await sheet.api.write('Records!A1', [
    header.slice(0, 10),
    ['A', '2026-11-09T09:00', 'Первый', 2.8, 3, 0, 0, '', ''],
    ['B', '2026-11-09T11:00', 'Третий', 2.8, 3, 0, 0, 'правка старой версией', '']
  ]);
  let asked = 0;
  assert.match(await sync(sheet, state, async ({ local, cloud }) => {
    asked++;
    assert.equal(local.id, 'B');
    assert.equal(cloud.comment, 'правка старой версией');
    return 'local';
  }), OK);
  assert.equal(asked, 1);
  assert.equal(state.records.find(r => r.id === 'B').comment, '');
  assert.equal(sheet.tabs.Records[2][7], '');
});

test('конфликт старой версии можно разрешить выбором версии из таблицы', async () => {
  const sheet = makeSheet(), state = device([rec('B', '2026-11-09T11:00', 'Третий')]);
  assert.match(await sync(sheet, state), OK);
  await sheet.api.write('Records!A1', [
    header.slice(0, 10),
    ['B', '2026-11-09T11:00', 'Третий', 2.8, 3, 0, 0, 'из таблицы', '']
  ]);
  assert.match(await sync(sheet, state, async () => 'cloud'), OK);
  assert.equal(state.records[0].comment, 'из таблицы');
});
