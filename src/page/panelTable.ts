import { 
  DefaultMap, Table, TABLE_COLUMNS, KNOWN_COLUMNS, PacketField, State,
  formatBytes, querySelector, htmlElement, htmlText, pathNumbersToStar,
  pathSplit, Events } from '../common';
import { buttonCallbacks } from './panels';
import { filterWidget } from './filterWidget';

const findJSONValue = /^(.*?)"([^"]+)"(,?)$/

Events.STATE.addListener(() => {
  Object.entries({
    '#aggPanel': loadAggTable,
    '#packetPanel': loadPacketTable,
  }).forEach(([sel, callback]) => {
    if (querySelector(sel).style.display === 'block') callback();
  });
});

Events.TABLE_PACKET_RES.addListener(table => {
  loadTable('#packetPanel table', table)
});

Events.TABLE_AGG_RES.addListener(table => {
  loadTable('#aggPanel table', table);
});

Events.PACKET_RES.addListener(response => {
  const {packetId, payload, params} = response;
  if (payload === undefined) {
    console.error('Unable to load packet: ', packetId);
    return;
  }

  const fieldLookup = new DefaultMap<string, Set<string>>(() => new Set());
  for (const [param, fields] of params) {
    for (const field of fields) {
      const lookup = fieldLookup.getOrCreate(field).value;
      lookup.add(field);
      lookup.add(param);
    }
  }

  const keykey: {[key: string]: string} = {};
  for (const key in payload) {
    keykey[key] = key;
    payload[key] = PacketField.fromJSON(payload[key]);
    fieldLookup.getOrCreate(key).value.add(key);
    fieldLookup.getOrCreate(key).value.add(
      pathNumbersToStar(pathSplit(key)).join('.'));
  }

  const lines = JSON.stringify(keykey, undefined, 2);
  const nodes: Node[] = [];
  const rawJSON: string[] = [];
  for (const line of lines.split('\n')) {
    const match = line.match(findJSONValue);
    if (match === null) {
      nodes.push(htmlText(line + '\n'));
      rawJSON.push(line, '\n');
      continue;
    }
    const [_, pre, field, post] = match;
    const jsonValue = JSON.stringify(payload[field]);
    rawJSON.push(pre, jsonValue, post, '\n');
    const stateSet = State.fromField(
      field, payload[field].value, 
      Array.from(fieldLookup.get(field)?.values() ?? []));
    nodes.push(
      htmlText(pre),
      htmlElement('div', {style: {display: 'inline-block'}},
        filterWidget(htmlText(jsonValue + post), stateSet)),
    );
    nodes.push(htmlText('\n'));
  }

  querySelector('#modal h1').innerText = `Packet ${packetId}`;
  querySelector('#copyText').innerText = rawJSON.join('');
  const pre = querySelector('#modal pre');
  pre.innerHTML = '';
  pre.append(...nodes);

  querySelector<HTMLDialogElement>('#modal').showModal();
});

Object.assign(buttonCallbacks, {
  loadAggTable,
  loadPacketTable,
  dialogHide: function() {
    querySelector<HTMLDialogElement>('#modal').close();
    querySelector('#modal pre').innerText = '';
    querySelector('#modal h1').innerText = 'Packet _';
  },
  dialogCopy: function() {
    const copyText = querySelector<HTMLDivElement>('#copyText');
    navigator.clipboard.writeText(copyText.innerText);
  }
});

function loadAggTable() {
  Events.TABLE_AGG_REQ.emit(null);
}

function loadPacketTable() {
  const limit = querySelector<HTMLSelectElement>('#table_cnt').value;
  Events.TABLE_PACKET_REQ.emit(Number(limit));
}

/** Known column headings and associated help text */
const headerTitles = new Map<string, string>([
  [TABLE_COLUMNS.ID, 'Unique Packet Identifier'],
  [TABLE_COLUMNS.SIZE, 'Approxmate Packet Size'],
  [TABLE_COLUMNS.COUNT, 'Count of packets']
]);

/** Get the "value" of a table cell for sorting purposes */
function getCellValue(cell: Element, idx: number) {
  const el = (cell.children[idx] as HTMLElement);
  return el.dataset.val ?? el.innerText ?? cell.children[idx].textContent ?? '';
}

/** Sort a given column */
function comparer(idx: number, asc: boolean) {
  return function(a: Element, b: Element) { 
    return function(v1: string, v2: string) {
      if (v1 !== '' && v2 !== '' && !isNaN(Number(v1)) && !isNaN(Number(v2))) {
        return Number(v1) - Number(v2);
      } else {
        return v1.toString().localeCompare(v2);
      }
    }(getCellValue(asc ? a : b, idx), getCellValue(asc ? b : a, idx));
  };
}

/** Given a selector and some data, build an HTML table */
function loadTable(selector: string, data: Table) {
  const table = querySelector(selector);
  const headerMap = new Map<string, string>();
  table.querySelectorAll('th').forEach(th => {
    if (th.dataset.asc !== undefined) {
      headerMap.set(th.innerText, th.dataset.asc);
    }
  });
  table.innerHTML = '';
  const thead_tr = document.createElement('tr');

  /** flip params to field lookup */
  const fieldLookup = new DefaultMap<string, string[]>(() => []);
  for (const [param, fields] of data.params ?? []) {
    for (const field of fields) {
      fieldLookup.getOrCreate(field).value.push(param);
    }
  }
  
  table.append(thead_tr);

  for (const h of data.headers) {
    thead_tr.append(
      htmlElement('th', {
        innerText: h,
        title: headerTitles.get(h),
        onClick: tableHeaderClick,
      })
    );
  }

  for (const row of data.rows) {
    const tr = document.createElement('tr');
    /** param => field => value */
    const grouping: {[param: string]: {[field: string]: string}} = {};
    row.forEach((value, i) => {
      const field = data.headers[i];
      if (KNOWN_COLUMNS.indexOf(field) !== -1) {
        return;
      }
      fieldLookup.get(field)?.forEach(param => {
        if (grouping[param] === undefined) grouping[param] = {};
        grouping[param][field] = value;
      });
    });
    row.forEach((value, i) => {
      const td = document.createElement('td');
      const field = data.headers[i];
      if (field === TABLE_COLUMNS.ID) {
        const a = htmlElement('a', {
          href: '#', innerText: value, dataset: {id: value},
          onClick: (e) => {
            e.preventDefault();
            const packetId = Number((e.target as HTMLElement).dataset.id ?? '-1');
            Events.PACKET_REQ.emit(packetId);
          }
        });
        td.appendChild(a);
      } else if (field === TABLE_COLUMNS.SIZE) {
        td.innerText = formatBytes(Number(value));
        td.dataset.val = value;
      } else if (field === TABLE_COLUMNS.COUNT) {
        td.append(filterWidget(value, State.fromGroupings(grouping)));
      } else {
        td.append(
          filterWidget(value, State.fromField(field, value, fieldLookup.get(field) ?? [])),
        );
      }
      tr.appendChild(td);
    });
    table.appendChild(tr);
  }
}

function tableHeaderClick(e: MouseEvent) {
  const th = e.target as HTMLElement;
  const table = th.closest('table');
  table?.querySelectorAll('th').forEach(el => {
    if (el.innerText !== th.innerText) {
      delete el.dataset['asc'];
    }
  });
  if (table === null) {
    console.error('Unable to locate nearest table');
    return;
  }
  // TODO: See if we can preserve sort order across table generations...
  Array.from(table.querySelectorAll('tr:nth-child(n+2)'))
    .sort(comparer(
      // @ts-ignore
      Array.from(th.parentNode.children).indexOf(th),
      '1' == (th.dataset.asc = (th.dataset.asc === '1' ? '0' : '1'))))
    .forEach(tr => table.appendChild(tr) );
}
