import * as packets from "../packets"
import { inflateObject, formatBytes, querySelector, htmlElement } from '../../lib'
import { buttonCallbacks } from './panels';

declare global {
  /** Packet references to prevent garbage collection */
  var TABLE: packets.Table;
}

Object.assign(buttonCallbacks, {
  loadAggTable: function() {
    loadTable('#aggPanel table', window.VIEW.getAggregateTable());
  },
  loadPacketTable: function() {
    const limit = querySelector<HTMLSelectElement>('#table_cnt').value;
    window.TABLE = window.VIEW.getPacketTable(Number(limit));

    loadTable('#packetPanel table', window.TABLE);
  },
  dialogHide: function() {
    querySelector<HTMLDialogElement>('#modal').close();
    querySelector('#modal pre').innerText = '';
    querySelector('#modal h1').innerText = `Packet _`;
  },
  dialogCopy: function() {
    const pre = querySelector<HTMLPreElement>('#modal pre');
    navigator.clipboard.writeText(pre.innerText);
  }
});

/** Known column headings and associated help text */
const headerTitles: {[key: string]: string} = {
  '_id': 'Unique Packet Identifier',
  '_sz': 'Approxmate Packet Size',
  '_cnt': 'Count of packets',
};

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
}};

/** Given a selector and some data, build an HTML table */
function loadTable(selector: string, data: packets.Table) {
  const table = querySelector(selector);
  table.innerHTML = '';
  const thead_tr = document.createElement('tr');
  table.append(thead_tr);

  data.headers.forEach(h => {
    thead_tr.append(
      htmlElement('th', {
        innerText: h,
        title: headerTitles[h],
        onClick: (e) => {
          const th = e.target as HTMLElement;
          const table = th.closest('table');
          if (table === null) {
            console.error('Unable to locate nearest table')
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
    row.forEach((cell, i) => {
      const td = document.createElement('td');
      if (data.headers[i] === '_id') {
        const a = htmlElement('a', {
          href: '#', innerText: cell, dataset: {id: cell},
          onClick: (e) => {
            e.preventDefault();
            const packetId = Number((e.target as HTMLElement).dataset.id ?? '-1');
            const packet = window.TABLE.packets.get(packetId);
            if (packet === undefined) {
              console.error('Unable to load packet: ', packetId);
              return;
            }
            const packetString = JSON.stringify(inflateObject(packet.payload), undefined, 2);
            querySelector('#modal h1').innerText = `Packet ${packetId}`;
            querySelector('#modal pre').innerText = packetString;
            querySelector<HTMLDialogElement>('#modal').showModal();
          }
        });
        td.appendChild(a);
      } else if (data.headers[i] === '_sz') {
        td.innerText = formatBytes(Number(cell));
        td.dataset.val = cell;
      } else {
        td.innerText = cell;
      }
      tr.appendChild(td);
    });
    table.appendChild(tr);
  });
}
