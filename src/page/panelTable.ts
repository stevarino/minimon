import { DefaultMap, Table, TABLE_COLUMNS, KNOWN_COLUMNS } from '../common/types';
import { formatBytes, querySelector, htmlElement } from '../common/lib';
import { buttonCallbacks } from './panels';
import { filtersFromField, filtersFromGrouping, filterWidget } from './filterWidget';
import * as events from '../common/events';

events.STATE.addListener(() => {
  Object.entries({
    '#aggPanel': loadAggTable,
    '#packetPanel': loadPacketTable,
  }).forEach(([sel, callback]) => {
    if (querySelector(sel).style.display === 'block') callback();
  });
});

events.TABLE_PACKET_RES.addListener(table => {
  loadTable('#packetPanel table', table)
});

events.TABLE_AGG_RES.addListener(table => {
  loadTable('#aggPanel table', table);
});

events.PACKET_RES.addListener(([packetId, packet]) => {
  console.log(packetId, packet);
  if (packet === undefined) {
    console.error('Unable to load packet: ', packetId);
    return;
  }
  querySelector('#modal h1').innerText = `Packet ${packetId}`;
  querySelector('#modal pre').innerText = packet;
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
    const pre = querySelector<HTMLPreElement>('#modal pre');
    navigator.clipboard.writeText(pre.innerText);
  }
});

function loadAggTable() {
  events.TABLE_AGG_REQ.emit(null);
}

function loadPacketTable() {
  const limit = querySelector<HTMLSelectElement>('#table_cnt').value;
  events.TABLE_PACKET_REQ.emit(Number(limit));
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
  /** Field to params[] */
  const fieldLookup = new DefaultMap<string, string[]>(() => []);
  data.groupMapping?.forEach((fields, param) => {
    fields.forEach(field => fieldLookup.getOrCreate(field).value.push(param));
  });
  table.append(thead_tr);

  data.headers.forEach(h => {
    thead_tr.append(
      htmlElement('th', {
        innerText: h,
        title: headerTitles.get(h),
        onClick: (e) => {
          const th = e.target as HTMLElement;
          const table = th.closest('table');
          table?.querySelectorAll('th').forEach(th => {
            if (th.innerText !== h) {
              delete th.dataset['asc'];
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
        },
      })
    );
  });

  data.rows.forEach(row => {
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
            events.PACKET_REQ.emit(packetId);
          }
        });
        td.appendChild(a);
      } else if (field === TABLE_COLUMNS.SIZE) {
        td.innerText = formatBytes(Number(value));
        td.dataset.val = value;
      } else if (field === TABLE_COLUMNS.COUNT) {
        td.append(filterWidget(value, filtersFromGrouping(grouping)));
      } else {
        td.append(
          filterWidget(value, filtersFromField(field, value, fieldLookup.get(field) ?? [])),
        );
      }
      tr.appendChild(td);
    });
    table.appendChild(tr);
  });
}
