import { ROOT } from '../packets';
import { rebuildFilterList } from './panelFilters';
import { View, Dataset } from '../packets';
import { EQUALS, Grouping, MATCHES } from '../packets/filters';
import { htmlElement, htmlText, querySelector, regexEscape } from '../../lib';

declare global {
  var VIEW: View;
  var CHART: any;
  var CHART_DATA: Dataset[];
  var CLICK_LOCK: boolean;
  var HOVER_LOCK: boolean;
}

window.CHART_DATA = [];
window.CLICK_LOCK = false;
window.HOVER_LOCK = false;

const legendParser = /(.*):\s+(\d+)\s*$/

window.VIEW = new View(window.CHART_DATA, (min: number, max: number) => {
  // @ts-ignore
  const chart = window.CHART;
  chart.options.scales.x.min = min;
  chart.options.scales.x.max = max;
  chart.update('none');
});

function applyDatasetFilter(e: MouseEvent) {
  e.preventDefault();
  const el = e.target as HTMLAnchorElement;
  const filters = JSON.parse(el.dataset.filter as string);
  window.VIEW.applyFilterSet(filters, el.dataset.remove_group);
  rebuildFilterList();
}

// @ts-ignore
window.CHART = new Chart(querySelector('#chart'), {
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

function tooltipTitle(key: string, val: string, more: boolean=false) {
  return `Filter for ${more ? '[ ' : ''}${key} == ${val}${more ? ', ... ]' : ''}`;
}

// https://www.chartjs.org/docs/latest/configuration/tooltip.html#external-custom-tooltips
function tooltip(context: any) {
  const tooltipEl = querySelector('#tooltip');
  const root = querySelector('#tooltip_content');
  if (window.CLICK_LOCK || window.HOVER_LOCK) return;

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
        const row = htmlElement('tr', {}, 
          htmlElement('td', {
            style: {
              color: colors.backgroundColor,
              borderColor: colors.borderColor,
            },
            innerText: '―――'
          }),
        );
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
          row.appendChild(htmlElement('td', {innerText: `${ROOT}:`}));
          row.appendChild(htmlElement('td', {innerText: cnt}));
          return;
        }
        const label: string[] = [];
        const grouping: Grouping = JSON.parse(labels);
        for (const [searchTerm, fields] of Object.entries(grouping)) {
          if (fields[searchTerm] !== undefined) {
            // non-wildcard search - 1:1 searchterm to field
            const data_filter = JSON.stringify([[searchTerm, EQUALS, fields[searchTerm]]]);
            const title = tooltipTitle(searchTerm, fields[searchTerm]);
            row.appendChild(htmlElement('td', {},
              htmlElement('a', {
                href: '#',
                innerText: searchTerm,
                dataset: {filter: data_filter, remove_group: searchTerm},
                title: title,
                onClick: applyDatasetFilter,
              }),
              htmlText(':')));
            row.appendChild(htmlElement('td', {}, 
              htmlElement('a', {
                href: '#',
                innerText: fields[searchTerm],
                dataset: {filter: data_filter, remove_group: searchTerm},
                title: title,
                onClick: applyDatasetFilter,
              })));
            row.appendChild(htmlElement('td', {innerText: cnt}));
          } else {
            // wildcard search - multiple fields
            const entries = Object.entries(fields);
            const escapedEntries = Array.from(new Set(entries.map(([_, v]) => v))).map(v => regexEscape(v)).join('|');
            row.appendChild(htmlElement('td', {},  // wildcard search term
              htmlElement('a', {
                href: '#',
                innerText: searchTerm,
                dataset: {filter: JSON.stringify([[searchTerm, MATCHES, `^(${escapedEntries})$`]]), remove_group: searchTerm},
                title: tooltipTitle(searchTerm, '[...]'),
                onClick: applyDatasetFilter,
              }),
              htmlText(':')
            ));
            if (entries.length > 0) {
              // has fields
              row.appendChild(htmlElement('td', {}, // multiple values
                htmlElement('a', {
                  href: '#',
                  innerText: '[...]',
                  dataset: {remove_group: searchTerm, filter: JSON.stringify(
                    entries.map(([k, v]) => [k, EQUALS, v])
                  )},
                  title: tooltipTitle(entries[0][0], entries[0][1], true),
                  onClick: applyDatasetFilter,
                })
              ));
            } else {
              row.appendChild(htmlElement('td')); // no fields
            }
            row.appendChild(htmlElement('td', {innerText: cnt}));
            Object.entries(fields).forEach(([field, value]) => {
              // multiple field rows per search term row
              let row = htmlElement('tr');
              rows.push(row);
              row.appendChild(htmlElement('td'));  // no line icon
              row.appendChild(htmlElement('td', {},
                htmlElement('a', {
                  href: '#',
                  innerText: field,
                  dataset: {filter: JSON.stringify([[field, EQUALS, value]]), remove_group: searchTerm},
                  title: tooltipTitle(field, value),
                  onClick: applyDatasetFilter,
                }),
                htmlText(':')));
              row.appendChild(htmlElement('td', {}, 
                htmlElement('a', {
                  href: '#',
                  innerText: value,
                  dataset: {filter: JSON.stringify([[searchTerm, EQUALS, value]]), remove_group: searchTerm},
                  title: tooltipTitle(searchTerm, value),
                  onClick: applyDatasetFilter,
                })));
              row.appendChild(htmlElement('td'));  // no count
            });
          }
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
  window.HOVER_LOCK = true;
});

querySelector('#tooltip_content').addEventListener('mouseleave', (e) => {
  window.HOVER_LOCK = false;
});
