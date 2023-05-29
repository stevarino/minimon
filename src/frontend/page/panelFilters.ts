import { hideSidebar } from "./panels";
import * as packets from "../packets"
import { selector } from "../..//lib"

function fieldAutocomplete() {
  selector('#field_wrapper', (el) => {
    el.innerHTML = '<div id="field_placeholder"></div>';
  })
  // @ts-ignore
  accessibleAutocomplete({
    id: 'field',
    element: document.querySelector('#field_placeholder'),
    source: (query: string, callback: (results: string[]) => void) => {
      const results = window.VIEW.getFields().filter(f => f.startsWith(query));
      callback(results);
    },
    // autoselect: true,
    displayMenu: 'overlay',
    placeholder: 'Field',
    showAllValues: true,
  });
}

document.getElementById('filter_form')?.addEventListener('submit', e=> {
  e.preventDefault();
  const field = document.getElementById('field') as HTMLInputElement;
  if ((e.submitter as HTMLButtonElement).value === 'Group By') {
    window.VIEW.addFilter(field.value, packets.FILTER.GROUP, packets.NULL);
  } else {
    const filter = document.getElementById('filter') as HTMLSelectElement;
    const value = document.getElementById('value') as HTMLInputElement;
    window.VIEW.addFilter(field.value, filter.value, value.value);
  }
  resetFilterForm();
});

function resetFilterForm() {
  selector('#filter', (el) => {
    (el as HTMLSelectElement).value = (el.childNodes[0] as HTMLOptionElement).value;
  })
  selector('#value', (el) => {
    (el as HTMLInputElement).value = '';
  })
  fieldAutocomplete();
  hideSidebar();
  rebuildFilterList();
}

export function rebuildFilterList() {
  const ul = document.getElementById('active_filters') as HTMLUListElement;
  Array.from(ul.childNodes).forEach(n => ul.removeChild(n));
  window.VIEW.getFilters().forEach(f => {
    const li = document.createElement('li');
    ul.appendChild(li);

    const fieldSpan = document.createElement('span');
    fieldSpan.innerText = f.field;
    fieldSpan.classList.add('isfield')

    const filterSpan = document.createElement('span');
    filterSpan.classList.add('isfilter');
    filterSpan.innerText = f.type.label;

    const valueSpan = document.createElement('span');
    valueSpan.classList.add('isvalue');
    valueSpan.innerText = String(f.value);

    if (f.type.hasValue) {
      for (const el of [fieldSpan, filterSpan, valueSpan]) {
        li.appendChild(el);
        li.appendChild(document.createTextNode(' '));
      }
    } else {
      for (const el of [filterSpan, fieldSpan]) {
        li.appendChild(el);
        li.appendChild(document.createTextNode(' '));
      }
    }
    const btn = document.createElement('button');
    btn.innerText = 'close';
    btn.classList.add('material-symbols-outlined');
    btn.dataset.field = f.field;
    btn.dataset.filter = String(f.type.id);
    btn.dataset.value = String(f.value);
    btn.addEventListener('click', e => {
      const btn = e.target as HTMLButtonElement;
      window.VIEW.removeFilter(
        btn.dataset.field as string,
        btn.dataset.filter as string,
        btn.dataset.value as string);
      rebuildFilterList();
      hideSidebar();
    });
    li.appendChild(btn);
  })
}

packets.FILTER.forEach(filter => {
  if (filter.hasValue) {
    const option = document.createElement('option');
    option.innerText = filter.label;
    option.setAttribute('value', String(filter.id));
    document.getElementById('filter')?.appendChild(option);
  }
});

fieldAutocomplete();