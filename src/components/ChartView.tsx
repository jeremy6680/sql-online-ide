import { useMemo } from 'react'
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, BarElement, LineElement, PointElement,
  ArcElement, Title, Tooltip, Legend, BubbleController
} from 'chart.js'
import { Bar, Line, Pie, Bubble } from 'react-chartjs-2'
import type { QueryResult, ChartType } from '../types'

ChartJS.register(
  CategoryScale, LinearScale, BarElement, LineElement, PointElement,
  ArcElement, Title, Tooltip, Legend, BubbleController
)

const COLORS = [
  '#7aa2f7', '#bb9af7', '#9ece6a', '#f7768e', '#e0af68',
  '#2ac3de', '#ff9e64', '#73daca', '#f7768e', '#41a6b5'
]

function getChartOptions(isDark: boolean) {
  const gridColor = isDark ? '#2a2b3d' : '#e2e8f0'
  const tickColor = isDark ? '#565f89' : '#94a3b8'
  const legendColor = isDark ? '#c0caf5' : '#1e293b'
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { labels: { color: legendColor } } },
    scales: {
      x: { ticks: { color: tickColor }, grid: { color: gridColor } },
      y: { ticks: { color: tickColor }, grid: { color: gridColor } }
    }
  }
}

function getPieOptions(isDark: boolean) {
  const legendColor = isDark ? '#c0caf5' : '#1e293b'
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { labels: { color: legendColor } } }
  }
}

interface ChartViewProps {
  result: QueryResult
  chartType: ChartType
  isDark: boolean
}

export function ChartView({ result, chartType, isDark }: ChartViewProps) {
  const chartData = useMemo(() => {
    if (!result.columns.length || !result.rows.length) return null

    const labels = result.rows.map(row => String(row[0]))
    const datasets = result.columns.slice(1).map((col, i) => ({
      label: col,
      data: result.rows.map(row => {
        const val = row[i + 1]
        return typeof val === 'number' ? val : parseFloat(String(val)) || 0
      }),
      backgroundColor: COLORS[i % COLORS.length] + '80',
      borderColor: COLORS[i % COLORS.length],
      borderWidth: 2,
    }))

    return { labels, datasets }
  }, [result])

  if (!chartData || chartType === 'none') {
    return (
      <div className="flex items-center justify-center h-full text-[var(--ide-text-4)] text-sm">
        Select a chart type above to visualize data.
        <br />
        First column is used as labels, remaining columns as data series.
      </div>
    )
  }

  const chartOptions = getChartOptions(isDark)
  const pieOptions = getPieOptions(isDark)

  return (
    <div className="h-full p-4">
      {chartType === 'bar' && <Bar data={chartData} options={chartOptions as never} />}
      {chartType === 'line' && <Line data={chartData} options={chartOptions as never} />}
      {chartType === 'pie' && (
        <Pie
          data={{
            labels: chartData.labels,
            datasets: [{
              data: chartData.datasets[0]?.data || [],
              backgroundColor: COLORS.map(c => c + '99'),
              borderColor: COLORS,
              borderWidth: 2
            }]
          }}
          options={pieOptions as never}
        />
      )}
      {chartType === 'bubble' && (
        <Bubble
          data={{
            datasets: [{
              label: result.columns[1] || 'data',
              data: result.rows.map(row => ({
                x: parseFloat(String(row[0])) || 0,
                y: parseFloat(String(row[1])) || 0,
                r: Math.abs(parseFloat(String(row[2])) || 5)
              })),
              backgroundColor: COLORS[0] + '80',
              borderColor: COLORS[0]
            }]
          }}
          options={chartOptions as never}
        />
      )}
    </div>
  )
}
