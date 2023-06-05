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
    window.VIEW.addGroup(field.value);
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
  // hideSidebar();
  rebuildFilterList();
}

function createFilterListItem(ul: HTMLUListElement, field: string) {
  const li = document.createElement('li');
  ul.appendChild(li);
  
  const span = document.createElement('span');
  span.innerText = field;
  span.classList.add('isfield');
  li.append(span, document.createTextNode(' '));

  return li;
}

function createButton(parent: HTMLElement, text: string) {
  const btn = document.createElement('button');
  btn.innerText = 'close';
  btn.classList.add('material-symbols-outlined');
  btn.dataset.field = text;
  parent.appendChild(btn);
  return btn;
}

function text(t: string) {
  return document.createTextNode(t);
}

export function rebuildFilterList() {
  const ul = document.getElementById('active_filters') as HTMLUListElement;
  Array.from(ul.childNodes).forEach(n => ul.removeChild(n));
  for (const [param, item] of window.VIEW.getFilterItems()) {
    if (item.isGroup()) {
      const li = createFilterListItem(ul, param);

      const filter = document.createElement('span');
      filter.innerText = 'GROUP BY';
      filter.classList.add('isFilter');
      li.prepend(filter, text(' '));


      createButton(li, param).addEventListener('click', e => {
        const btn = e.target as HTMLButtonElement;
        window.VIEW.removeGroup(btn.dataset.field as string);
        rebuildFilterList();
        // hideSidebar();
      });
    }

    for (const filter of item.filters) {
      const li = createFilterListItem(ul, param);

      const filterSpan = document.createElement('span');
      filterSpan.classList.add('isfilter');
      filterSpan.innerText = filter.type.label;

      const valueSpan = document.createElement('span');
      valueSpan.classList.add('isvalue');
      valueSpan.innerText = String(filter.testValue);

      li.append(filterSpan, text(' '), valueSpan, text(' '));

      const btn = createButton(li, param);
      btn.dataset.filter = filter.type.label;
      btn.dataset.value = String(filter.testValue);
      btn.addEventListener('click', e => {
        const btn = e.target as HTMLButtonElement;
        window.VIEW.removeFilter(
          btn.dataset.field as string,
          btn.dataset.filter as string,
          btn.dataset.value as string);
        rebuildFilterList();
        // hideSidebar();
      });
    }
  }
}

packets.FilterType.forEach(filter => {
  const option = document.createElement('option');
  option.innerText = filter.label;
  option.setAttribute('value', filter.label);
  document.getElementById('filter')?.appendChild(option);
});

fieldAutocomplete();