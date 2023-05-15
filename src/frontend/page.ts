import * as packets from "./packets"

// @ts-ignore
accessibleAutocomplete({
  id: 'field__autocomplete',
  element: document.querySelector('#field'),
  source: (query: string, callback: (results: string[]) => void) => {
    const results = window.VIEW.getFields().filter(f => f.startsWith(query));
    callback(results);
  },
  // autoselect: true,
  displayMenu: 'overlay',
  placeholder: 'Field',
  showAllValues: true,
});


document.querySelectorAll('#sidebar>ul>li').forEach(el => {
  el.addEventListener('click', (e) => {
    const id = 's_' + (e.target as HTMLElement).innerText;
    const div = document.getElementById(id);
    if (div == null) return;
    if (div.style.display === 'block') {
      hideSidebar();
    } else {
      showSidebar();
      (e.target as HTMLElement).classList.add('active');
      div.style.display = 'block';
    }
  })
});

export function hideSidebar() {
  document.querySelectorAll('#sidebar>ul>li').forEach(el => {
    el.classList.remove('active');
  });
  document.querySelectorAll('#sidebar>div').forEach(el => {
    (el as HTMLDivElement).style.display = 'none';
  });
  document.getElementById('sidebar')?.classList.add('collapsed');
}

export function showSidebar() {
  document.querySelectorAll('#sidebar>ul>li').forEach(el => {
    el.classList.remove('active');
  });
  document.querySelectorAll('#sidebar>div').forEach(el => {
    (el as HTMLDivElement).style.display = 'none';
  });
  document.getElementById('sidebar')?.classList.remove('collapsed');
}

document.getElementById('filter_form')?.addEventListener('submit', e=> {
  e.preventDefault();
  const field = document.getElementById('field__autocomplete') as HTMLInputElement;
  const filter = document.getElementById('filter') as HTMLSelectElement;
  const value = document.getElementById('value') as HTMLInputElement;
  window.VIEW.addFilter(field.value, filter.value, value.value);

  resetFilterForm();
});

function resetFilterForm() {
  const field = document.getElementById('field__autocomplete') as HTMLInputElement;
  const filter = document.getElementById('filter') as HTMLSelectElement;
  const value = document.getElementById('value') as HTMLInputElement;
  field.value = '';
  field.focus();
  window.setTimeout(() => {filter.focus()}, 100);
  filter.value = (filter.childNodes[0] as HTMLOptionElement).value;
  value.value = '';
  hideSidebar();
  rebuildFilterList();
}

export function rebuildFilterList() {
  const ul = document.getElementById('active_filters') as HTMLUListElement;
  Array.from(ul.childNodes).forEach(n => ul.removeChild(n));
  console.log('filters:');
  window.VIEW.getFilters().forEach(f => {
    console.log(f.field, f.type.label, f.value);
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
  } else {
    const btn = document.createElement('button');
    btn.innerText = filter.label;
    btn.value = String(filter.id);
    btn.addEventListener('click', (e) => {
      const field = document.getElementById('field__autocomplete') as HTMLInputElement;
      e.preventDefault();
      window.VIEW.addFilter(field.value, (e.target as HTMLButtonElement).value, packets.NULL);
      resetFilterForm();
    });
    document.getElementById('filterWithoutValue')?.appendChild(btn);
  }
});
