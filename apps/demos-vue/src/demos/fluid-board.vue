<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { GrafloriaDashboard } from '@grafloria/vue';
import type { DashboardHandle, DashboardViewSpec } from '@grafloria/element';
import { markReady } from '../ready';

// THE FLUID BOARD. No width in :options → mode 'fluid': the board is 100% of
// its element at zoom 1 and GROWS by default. The switches are PROPS — a ref
// change is one handle call on the live board, never a remount: :sizing 'fit'
// keeps the height and squeezes rows; :layout 'split' turns the grid into the
// DevExpress-style splitter tree (no corner handles).
const handle = ref<DashboardHandle | null>(null);
const layout = ref<'grid' | 'split'>('grid');
const sizing = ref<'fit' | 'grow'>('grow');
// The drag handle, live on the handle: the whole card, the caption strip
// (DevExpress caption drag) or a painted grip placed along the top edge.
const drag = ref<'anywhere' | 'caption' | 'grip'>('anywhere');
const gripPos = ref<'left' | 'center' | 'right'>('left');
const gripPlace = ref<'inside' | 'outside'>('inside');
watch([drag, gripPos, gripPlace], ([d, p, l]) => {
  handle.value?.setDragHandle(d === 'grip' ? { grip: true, position: p, placement: l } : d === 'caption');
});
const options = { columns: 12, gap: 10 };
const views: DashboardViewSpec[] = [{ id: 'main', widgets: [
  { id: 'rev',  kind: 'kpi',   span: 3, rows: 1, data: { label: 'Revenue',   value: '$6.81M', delta: 12.4, spark: [3.9, 4.4, 4.1, 5.2, 5.9, 6.8] } },
  { id: 'cust', kind: 'kpi',   span: 3, rows: 1, data: { label: 'Customers', value: '1,284',  delta: 8.1,  spark: [980, 1010, 1090, 1150, 1210, 1284] } },
  { id: 'win',  kind: 'kpi',   span: 3, rows: 1, data: { label: 'Win rate',  value: '27.4%', delta: -1.2, spark: [29, 28.5, 28, 27.9, 27.6, 27.4] } },
  { id: 'nps',  kind: 'kpi',   span: 3, rows: 1, data: { label: 'NPS',       value: '61',    delta: 4.0,  spark: [52, 54, 57, 58, 60, 61] } },
  { id: 'trend', kind: 'line', span: 8, rows: 3, title: 'Revenue vs target',
    data: { series: [{ name: 'Revenue', values: [4.1, 4.4, 4.9, 5.2, 5.9, 6.8] }, { name: 'Target', values: [4.0, 4.5, 5.0, 5.5, 6.0, 6.5] }],
            labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'] } },
  { id: 'mix',  kind: 'donut', span: 4, rows: 3, title: 'Revenue by region',
    data: { slices: [{ label: 'North America', value: 2860 }, { label: 'EMEA', value: 1920 }, { label: 'APAC', value: 1340 }, { label: 'LATAM', value: 690 }] } },
  { id: 'reps', kind: 'table', span: 7, rows: 3, title: 'Top reps',
    data: { columns: ['Rep', 'Region', 'Closed', 'Quota'],
            rows: [['A. Farouk', 'EMEA', 412000, '118%'], ['J. Park', 'APAC', 388000, '104%'], ['M. Silva', 'LATAM', 301000, '96%'], ['R. Chen', 'NA', 297000, '91%']] } },
  { id: 'funnel', kind: 'funnel', span: 5, rows: 3, title: 'Pipeline',
    data: { stages: [{ label: 'Leads', value: 1840 }, { label: 'Qualified', value: 920 }, { label: 'Proposal', value: 410 }, { label: 'Won', value: 188 }] } },
] }];

function addRow() {
  handle.value?.addWidget({ id: 'row-' + Date.now(), kind: 'kpi', span: 12, rows: 1, data: { label: 'Added row', value: '+1' } });
}
onMounted(() => markReady());
</script>

<template>
  <div class="fb-page">
    <div class="fb-bar">
      <button id="fit" :class="{ on: sizing === 'fit' }" @click="sizing = 'fit'">Fit</button>
      <button id="grow" :class="{ on: sizing === 'grow' }" @click="sizing = 'grow'">Grow</button>
      <span class="sep"></span>
      <button id="grid" :class="{ on: layout === 'grid' }" @click="layout = 'grid'">Grid</button>
      <button id="split" :class="{ on: layout === 'split' }" @click="layout = 'split'">Split</button>
      <span class="sep"></span>
      <label>Drag <select id="drag" v-model="drag">
        <option value="anywhere">anywhere</option><option value="caption">by caption</option><option value="grip">by grip</option></select></label>
      <select id="grip-pos" v-model="gripPos" :disabled="drag !== 'grip'">
        <option value="left">left</option><option value="center">center</option><option value="right">right</option></select>
      <select id="grip-place" v-model="gripPlace" :disabled="drag !== 'grip'">
        <option value="inside">inside</option><option value="outside">outside</option></select>
      <span class="sep"></span>
      <button id="add" @click="addRow">+ Add a row</button>
    </div>
    <div class="fb-board">
      <GrafloriaDashboard :views="views" :options="options" :layout="layout" :sizing="sizing" @ready="handle = $event" />
    </div>
  </div>
</template>

<style scoped>
.fb-page { height: 100vh; display: flex; flex-direction: column; }
.fb-bar { display: flex; gap: 6px; align-items: center; height: 44px; padding: 0 10px; box-sizing: border-box;
       border-bottom: 1px solid #e5e7eb; font: 13px system-ui, sans-serif; }
.fb-bar button { padding: 5px 10px; border: 1px solid #d1d5db; border-radius: 6px; background: #fff; cursor: pointer; }
.fb-bar button.on { background: #3B52D9; border-color: #3B52D9; color: #fff; }
.fb-bar .sep { width: 1px; height: 20px; background: #e5e7eb; margin: 0 4px; }
.fb-board { flex: 1; min-height: 0; }
.fb-bar label { display: inline-flex; align-items: center; gap: 6px; }
.fb-bar select { font: inherit; padding: 4px 6px; border: 1px solid #d1d5db; border-radius: 6px; background: #fff; }
.fb-bar select:disabled { opacity: .45; }
</style>
