import { yieldArray } from '../../lib'

interface ButtonCallback {
  [key: string]: (target: HTMLElement) => void;
}

const buttonCallbacks: ButtonCallback = {
  toggleSidebar: (target) => {
    const id = 's_' + target.innerText;
    const div = document.getElementById(id);
    if (div === null) {
      console.error('Bad callback target: ', target.innerText, target);
      return;
    }
    if (div.style.display === 'block') {
      hideSidebar();
    } else {
      showSidebar();
      target.classList.add('active');
      div.style.display = 'block';
    }
  },
  
  download: () => {
    const data = Array.from(yieldArray(window.VIEW.getPackets()));
    const blob = new Blob(data, { type: 'application/json' });
    const el = window.document.createElement('a');
    el.href = window.URL.createObjectURL(blob);
    el.download = 'data.json';
    document.body.appendChild(el);
    el.click();
    document.body.removeChild(el);
    window.URL.revokeObjectURL(el.href);
  }
}


document.querySelectorAll('#sidebar>ul>li').forEach(el => {
  el.addEventListener('click', (e) => {
    const name = (e.target as HTMLElement).dataset['callback'] ?? 'toggleSidebar';
    const callback = buttonCallbacks[name];
    if (callback === undefined) {
      console.error('Bad button callback ', name, e.target);
      return;
    }
    callback(e.target as HTMLElement);
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
