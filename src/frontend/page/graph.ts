import { View, Dataset, ROOT } from '../packets';
import { rebuildFilterList } from './panelFilters'
import { sample } from './packetRate';

declare global { 
  var CLICK_LOCK: boolean;
  var HOVER_LOCK: boolean;
  var CHART: any;
  var VIEW: View;
  var CHART_DATA: Dataset[];
}

window.CHART_DATA = [];
window.CLICK_LOCK = false;
window.HOVER_LOCK = false;

// @ts-ignore
window.CHART = new Chart(document.getElementById('chart'), {
  type: 'line',
  options: {
    maintainAspectRatio: false,
    parsing: false,
    normalized: true,
    animation: false,
    onClick: () => { window.CLICK_LOCK = !window.CLICK_LOCK; },
    interaction: {
      mode: 'nearest',
      intersect: false,
      axis: 'xy',
    },
    scales: {
      x: {
        type: 'time',
        unit: 'minute',
      }
    },
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        enabled: false,
        external: tooltip,
      }
    }
  },
  data: {
    datasets: window.CHART_DATA,
  },
});

window.VIEW = new View(window.CHART_DATA, (min: number, max: number) => {
  // @ts-ignore
  const chart = window.CHART;
  chart.options.scales.x.min = min;
  chart.options.scales.x.max = max;
  chart.update('none');
});

const eventSource = new EventSource('/packets');
eventSource.addEventListener('packet', event => {
  window.VIEW.onPacket(event.data, (packet)=> {
    sample.push({ ms: packet.ms, size: packet.size })
  });
});

// https://www.chartjs.org/docs/latest/configuration/tooltip.html#external-custom-tooltips
function tooltip(context: any) {
  const tooltipEl = document.getElementById('tooltip');
  const root = document.getElementById('tooltip_content');
  if (window.CLICK_LOCK || window.HOVER_LOCK) return;

  if (tooltipEl === null || root === null) {
    console.error('missing elements');
    return;
  }

  const rect = root?.getBoundingClientRect();

  // Hide if no tooltip
  const tooltipModel = context.tooltip;
  if (tooltipModel.opacity === 0) {
    tooltipEl.style.display = 'none';
    return;
  }

  const groups = window.VIEW.getGroups();
  const position = context.chart.canvas.getBoundingClientRect();
  if (tooltipModel.caretX / (position.right - position.left) < 0.5) {
    root.style.left = '5';
    root.style.right = 'auto';
  } else {
    root.style.left = 'auto';
    root.style.right = '5';
  }

  // Set Text
  if (tooltipModel.body) {
    const bodyLines = tooltipModel.body.map((b: {lines: string[]}) => b.lines);

    let nodes: (HTMLElement | Text)[] = [];
    (tooltipModel.title || []).forEach((t: string) => {
      nodes.push(
        document.createTextNode(t),
        document.createElement('br'));
    });

    bodyLines.forEach(function (lines: string[], i: number) {
      const colors = tooltipModel.labelColors[i];
      lines.forEach((line: string) => {
        const span = document.createElement('span');
        span.style.color = colors.backgroundColor;
        span.style.borderColor = colors.borderColor;
        span.innerText = '―';
        nodes.push(span, document.createTextNode(' '));
        // really hope there are not multiple colons...
        const [filter, val] = line.split(':');
        if (filter != ROOT) {
          const label: string[] = [];
          new URLSearchParams(filter).forEach((val, key) => {
            label.push(`${key}=${val}`)
          });
          const link = document.createElement('a');
          link.href = '#';
          link.innerText = label.join('; ');
          link.dataset.filter = filter;
          link.addEventListener('click', (e) => {
            e.preventDefault();
            const l = e.target as HTMLAnchorElement;
            window.VIEW.applyFilterSet(l.dataset.filter as string);
            rebuildFilterList();
          })
          nodes.push(link);
        } else {
          nodes.push(document.createTextNode(filter));
        }
        nodes.push(
          document.createTextNode(' ' + val),
          document.createElement('br'));
      });
    });
    tooltipEl.style.display = 'block';
    root.innerHTML = '';
    nodes.pop();
    nodes.forEach(el => root.appendChild(el));
  }

  // Display, position, and set styles for font
  tooltipEl.style.left = position.left + window.pageXOffset + tooltipModel.caretX + 'px';
  tooltipEl.style.top = position.top + window.pageYOffset + tooltipModel.caretY + 'px';
  // tooltipEl.style.font = bodyFont.string;
  tooltipEl.style.padding = tooltipModel.padding + 'px ' + tooltipModel.padding + 'px';
}

document.getElementById('tooltip_content')?.addEventListener('mouseenter', (e) => {
  window.HOVER_LOCK = true;
});

document.getElementById('tooltip_content')?.addEventListener('mouseleave', (e) => {
  window.HOVER_LOCK = false;
});
