import { createChart, Point, Chart } from '../common/chartJS';
import { ROOT, Grouping, State, htmlElement, querySelector, Events } from '../common';
import { filterWidget } from './filterWidget';

let CLICK_LOCK = false;
let HOVER_LOCK = false;

const legendParser = /(.*):\s+(\d+)\s*$/;

declare global {
  var CHART: Chart;
}

window.CHART = createChart(querySelector<HTMLCanvasElement>('#chart'), {
  'options.onClick': () => { CLICK_LOCK = !CLICK_LOCK },
  'options.plugins.tooltip': { enabled: false, external: tooltip },
});

Events.CHART_DATA.addListener(data => {
  if (CHART.options?.scales?.x !== undefined) {
    CHART.options.scales.x.min = data.startTime;
    CHART.options.scales.x.max = data.endTime;
  }

  const updates = new Map(data.datasets);
  if (data.isPartial) {
    const current = new Set<string>();

    for (const ds of CHART.data.datasets) {
      if (ds.label === undefined) continue;  // shouldn't happen
      current.add(ds.label);
      const dsUpdate = updates.get(ds.label);

      // merge dataset with update
      if (dsUpdate !== undefined) {
        const head = (ds.data[ds.data.length - 1] as Point).x;
        for (const [x, y] of dsUpdate) {
          if (x < head) continue;
          if (x === head) {
            (ds.data[ds.data.length - 1] as Point).y = y;
          } else {
            ds.data.push({ x, y });
          }
        }
      }

      // trim dataset
      let i = 0;
      for (i=0; i<ds.data.length; i++) {
        if ((ds.data[i] as Point).x >= data.startTime) break;
      }
      if (i > 0) ds.data = ds.data.slice(i);
    }
    for (const [update, pts] of updates) {
      if (current.has(update)) continue;
      CHART.data.datasets.push({
        label: update,
        data: pts.map(([x, y]) => { return { x, y }; })
      })
    }
  } else {
    // full chart update
    CHART.data.datasets.length = 0;
    for (const [update, pts] of updates) {
      CHART.data.datasets.push({
        label: update,
        data: pts.map(([x, y]) => { return { x, y }; }),
      });
    }
  }
  CHART.update();
});

// https://www.chartjs.org/docs/latest/configuration/tooltip.html#external-custom-tooltips
function tooltip(context: any) {
  const tooltipEl = querySelector('#tooltip');
  const root = querySelector('#tooltip_content');
  if (CLICK_LOCK || HOVER_LOCK) return;

  // Hide if no tooltip
  const tooltipModel = context.tooltip;
  if (tooltipModel.opacity === 0) {
    tooltipEl.style.display = 'none';
    return;
  }

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

    const rows: (HTMLElement)[] = [];

    bodyLines.forEach(function (lines: string[], i: number) {
      const colors = tooltipModel.labelColors[i];
      lines.forEach((line: string) => {
        const lineEl = htmlElement('span', {
          innerHTML: `<svg height="1em" width="1em">
                          <line x1="0" y1="50%" x2="100%" y2="50%"
                           style="stroke:${colors.borderColor}; stroke-width: 3" />
                        </svg>`,
        });
        const row = htmlElement('tr');
        rows.push(row);
        // really hope there are not multiple colons...
        const match = legendParser.exec(line);
        if (match === null) {
          console.error('Unable to match legend: ', line);
          row.appendChild(htmlElement('td', {innerText: line}));
          return;
        }
        const [_, labels, cnt] = match;
        if (labels === ROOT) {
          row.append(
            htmlElement('td', {}, lineEl),
            htmlElement('td', {innerText: `${ROOT}:`}),
            htmlElement('td', {innerText: cnt}));
          return;
        }
        const grouping: Grouping = JSON.parse(labels);
        row.append(htmlElement('td', {},
          filterWidget(lineEl, State.fromGroupings(grouping))
        ));
        for (const [searchTerm, fields] of Object.entries(grouping)) {
          let displayValue = '';
          const values = Object.values(fields);
          if (values.length === 1) {
            displayValue = values[0];
          } else {
            let count = 0, i = 0;
            for (i=0; i < values.length; i++) {
              count += values[i].length;
              if (i != 0 && count > 80) break;
            }
            if (i === values.length) {
              displayValue = `[ ${values.join(', ')} ]`;
            } else {
              displayValue = `[ ${ values.slice(0, i).join(', ') }, ... ]`;
            }
          }
          row.appendChild(htmlElement('td', {}, filterWidget(
            `${searchTerm} : ${displayValue}`,
            State.fromParam(searchTerm, fields))));
        }
      });
    });
    tooltipEl.style.display = 'block';
    root.innerHTML = '';
    (tooltipModel.title || []).forEach((t: string) => {
      root.appendChild(htmlElement('p', {innerText: t}));
    });
    const table = htmlElement('table');
    rows.forEach(tr => table.appendChild(tr));
    root.appendChild(table);
  }

  // Display, position, and set styles for font
  tooltipEl.style.left = position.left + window.pageXOffset + tooltipModel.caretX + 'px';
  tooltipEl.style.top = position.top + window.pageYOffset + tooltipModel.caretY + 'px';
  // tooltipEl.style.font = bodyFont.string;
  tooltipEl.style.padding = tooltipModel.padding + 'px ' + tooltipModel.padding + 'px';
}

querySelector('#tooltip_content').addEventListener('mouseenter', (e) => {
  HOVER_LOCK = true;
});

querySelector('#tooltip_content').addEventListener('mouseleave', (e) => {
  HOVER_LOCK = false;
});
