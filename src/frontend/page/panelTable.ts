import * as packets from "../packets"
import { inflateObject, formatBytes, querySelector } from '../../lib'
import { buttonCallbacks } from './panels';

declare global {
  var TABLE: packets.Table;
}

Object.assign(buttonCallbacks, {
  createTable,
  loadTable: function() {
    createTable();
  },
  dialogHide: function() {
    querySelector<HTMLDialogElement>('#modal').close();
    querySelector('#modal pre').innerText = '';
  },
  dialogCopy: function() {
    const pre = querySelector<HTMLPreElement>('#modal pre');
    navigator.clipboard.writeText(pre.innerText);
  }
});

function getCellValue(cell: Element, idx: number) {
  const el = (cell.children[idx] as HTMLElement);
  return el.dataset.val ?? el.innerText ?? cell.children[idx].textContent ?? '';
}

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

function createTable() {
  const headerTitles: {[key: string]: string} = {
    '_id': 'Unique Packet Identifier',
    '_sz': 'Approxmate Packet Size',
    '_cnt': 'Count of packets',
  }
  const cnt = querySelector<HTMLSelectElement>('#table_cnt');
  
  if (window.VIEW.getGroups().length === 0) {
    cnt.style.display = 'block';
  } else {
    cnt.style.display = 'none';
  }

  const tableData = window.VIEW.getTabularPackets(
    Number((cnt as HTMLSelectElement).value));
  window.TABLE = tableData;

  const table = querySelector('#table_table');
  table.innerHTML = '';
  const thead_tr = document.createElement('tr');
  table.append(thead_tr);

  tableData.headers.forEach(h => {
    const th = document.createElement('th');
    th.addEventListener('click', (() => {
      const table = th.closest('table');
      if (table === null) {
        console.error('Unable to locate nearest table')
        return;
      }
      Array.from(table.querySelectorAll('tr:nth-child(n+2)'))
          .sort(comparer(
            // @ts-ignore
            Array.from(th.parentNode.children).indexOf(th),
            '1' == (th.dataset.asc = (th.dataset.asc === '1' ? '0' : '1'))))
          .forEach(tr => table.appendChild(tr) );
      }));
  
    th.innerText = h;
    if (headerTitles[h] !== undefined) {
      th.title = headerTitles[h];
    }
    thead_tr.append(th);
  });


  tableData.rows.forEach(row => {
    const tr = document.createElement('tr');
    row.forEach((cell, i) => {
      const td = document.createElement('td');
      if (tableData.headers[i] === '_id') {
        const a = document.createElement('a');
        a.href = '#';
        a.innerText = cell;
        a.dataset.id = cell;
        a.addEventListener('click', (e) => {
          e.preventDefault();
          const packetId = Number((e.target as HTMLElement).dataset.id ?? '-1');
          const packet = window.TABLE.packets.get(packetId);
          if (packet === undefined) {
            console.error('Unable to load packet: ', packetId);
            return;
          }
          const packetString = JSON.stringify(inflateObject(packet.payload), undefined, 2);
          querySelector('#modal pre').innerText = packetString;
          querySelector<HTMLDialogElement>('#modal').showModal();
        });
        td.appendChild(a);
      } else if (tableData.headers[i] === '_sz') {
        td.innerText = formatBytes(Number(cell));
        td.dataset.val = cell;
      } else {
        td.innerText = cell;
      }
      tr.appendChild(td);
    });
    table.appendChild(tr);
  });
};

