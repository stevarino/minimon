import { ROOT } from '../packets';
// import { rebuildFilterList } from './panelFilters';
import { View } from '../packets';
import { Grouping } from '../packets/filters';
import { htmlElement, querySelector } from '../../lib';
import * as common from './common';
import { filtersFromArray, filtersFromGrouping, filtersFromParam, filterWidget } from "./filterWidget";


declare global {
  var VIEW: View;
}

let CLICK_LOCK = false;
let HOVER_LOCK = false;

const legendParser = /(.*):\s+(\d+)\s*$/;

// @ts-ignore
const CHART = new Chart(querySelector('#chart'), {
  type: 'line',
  options: {
    maintainAspectRatio: false,
    parsing: false,
    normalized: true,
    animation: false,
    onClick: () => { CLICK_LOCK = !CLICK_LOCK; },
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
      },
      colors: {
        // TODO: expand color options, themes, etc.
        // https://www.chartjs.org/docs/latest/general/colors.html#dynamic-datasets-at-runtime
        forceOverride: true
      }
    }
  },
  data: {
    labels: [],
    datasets: [],
  },
});

window.VIEW = new View(CHART.data, (min: number, max: number) => {
  CHART.options.scales.x.min = min;
  CHART.options.scales.x.max = max;
  CHART.update();
});

common.STATE.addListener((s) => window.VIEW.mergeFilterState(s));

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

    let rows: (HTMLElement)[] = [];

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
          filterWidget(lineEl, filtersFromGrouping(grouping))
        ));
        for (const [searchTerm, fields] of Object.entries(grouping)) {
          let displayValue: string = '';
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
              displayValue = `[ ${ values.slice(0, i).join(', ') }, ... ]`
            }
          }
          row.appendChild(htmlElement('td', {},
            filterWidget(`${searchTerm} : ${displayValue}`, filtersFromParam(searchTerm, fields))
          ));
          // const td = htmlElement('td', {'innerText': `${searchTerm} : ${displayValue}`});
          // row.appendChild(td);
          // td.append(
          //   paramFilterDrowpdown(searchTerm,  fields));
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
