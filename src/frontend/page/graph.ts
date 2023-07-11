import { createChart } from '../common/chartJS';

import { ROOT } from '../worker';
import { View } from '../worker';
import { Grouping } from '../worker/filters';
import { htmlElement, querySelector, overwriteObject } from '../../lib';
import * as common from '../common/common';
import { filtersFromGrouping, filtersFromParam, filterWidget } from './filterWidget';

let CLICK_LOCK = false;
let HOVER_LOCK = false;

const legendParser = /(.*):\s+(\d+)\s*$/;

const CHART = createChart(querySelector<HTMLCanvasElement>('#chart'), {
  'options.onClick': () => { CLICK_LOCK = !CLICK_LOCK },
  'options.plugins.tooltip': { enabled: false, external: tooltip },
});

window.VIEW = new View(CHART.data, (min: number, max: number) => {
  if (CHART.options.scales?.x !== undefined) {
    CHART.options.scales.x.min = min;
    CHART.options.scales.x.max = max;
  }
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
          filterWidget(lineEl, filtersFromGrouping(grouping))
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
          row.appendChild(htmlElement('td', {},
            filterWidget(`${searchTerm} : ${displayValue}`, filtersFromParam(searchTerm, fields))
          ));
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
